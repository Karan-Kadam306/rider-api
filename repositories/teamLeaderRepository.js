const { OPEN_PROMISE } = require('./followUpRepository');

// A user, if they exist; role and is_active tell the service whether they can lead riders.
async function findUser(client, { userId }) {
    const result = await client.query(
        `SELECT user_id::int AS user_id, name, email, role, is_active
         FROM users
         WHERE user_id = $1`,
        [userId]
    );

    return result.rows[0] ?? null;
}

// Whether the team leader currently holds the rider.
async function isAssigned(client, { userId, riderId }) {
    const result = await client.query(
        `SELECT 1
         FROM team_leader_riders
         WHERE user_id = $1 AND rider_id = $2 AND removed_at IS NULL`,
        [userId, riderId]
    );

    return result.rowCount > 0;
}

// Returns false when the team leader already holds the rider (the unique index refuses a second row).
async function insertLink(client, { userId, riderId, assignedBy }) {
    const result = await client.query(
        `INSERT INTO team_leader_riders (user_id, rider_id, assigned_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, rider_id) WHERE removed_at IS NULL DO NOTHING`,
        [userId, riderId, assignedBy]
    );

    return result.rowCount > 0;
}

// The row stays as history. Returns false when the team leader did not hold the rider.
async function removeLink(client, { userId, riderId, removedBy }) {
    const result = await client.query(
        `UPDATE team_leader_riders
         SET removed_at = now(), removed_by = $3
         WHERE user_id = $1 AND rider_id = $2 AND removed_at IS NULL`,
        [userId, riderId, removedBy]
    );

    return result.rowCount > 0;
}

// Releases every rider the user holds, e.g. when they stop being a team leader.
async function removeAllForUser(client, { userId, removedBy }) {
    await client.query(
        `UPDATE team_leader_riders
         SET removed_at = now(), removed_by = $2
         WHERE user_id = $1 AND removed_at IS NULL`,
        [userId, removedBy]
    );
}

// The rider's current team leaders, first assigned first.
async function findRiderTeamLeaders(client, { riderId }) {
    const result = await client.query(
        `SELECT u.user_id::int AS user_id, u.name, u.email, u.is_active, l.assigned_at
         FROM team_leader_riders l
         JOIN users u ON u.user_id = l.user_id
         WHERE l.rider_id = $1 AND l.removed_at IS NULL
         ORDER BY l.assigned_at, u.user_id`,
        [riderId]
    );

    return result.rows;
}

// Active team leaders with how many riders each holds, for the assign picker.
async function findTeamLeaders(client) {
    const result = await client.query(
        `SELECT u.user_id::int AS user_id, u.name, u.email,
                COUNT(l.link_id)::int AS rider_count
         FROM users u
         LEFT JOIN team_leader_riders l ON l.user_id = u.user_id AND l.removed_at IS NULL
         WHERE u.role = 'team_leader' AND u.is_active
         GROUP BY u.user_id
         ORDER BY u.name, u.user_id`
    );

    return result.rows;
}

// Shared by the list and its count. $1 user, $2 search pattern or null.
const MY_RIDERS_FROM = `
    FROM team_leader_riders l
    JOIN riders r ON r.rider_id = l.rider_id`;

const MY_RIDERS_WHERE = `
    WHERE l.user_id = $1 AND l.removed_at IS NULL
      AND ($2::text IS NULL OR r.rider_id ILIKE $2 OR r.name ILIKE $2 OR r.phone ILIKE $2)`;

// The team leader's riders with their bike, last paid week and open escalations.
// Riders whose last payout was negative (they owe money) come first.
async function findMyRiders(client, { userId, search, limit, offset }) {
    const result = await client.query(
        `SELECT r.rider_id, r.name, r.phone, r.status, l.assigned_at,
                bike.bike_id, bike.chassis_number, bike.registration_number,
                payout.week_start AS last_paid_week,
                payout.net_payout AS last_net_payout,
                escalation.open_count AS open_escalations,
                escalation.open_amount AS open_escalation_amount
         ${MY_RIDERS_FROM}
         LEFT JOIN LATERAL (
             SELECT b.bike_id, b.chassis_number, b.registration_number
             FROM bike_assignments a
             JOIN bikes b ON b.bike_id = a.bike_id
             WHERE a.rider_id = r.rider_id AND a.returned_at IS NULL
             ORDER BY a.assigned_at DESC
             LIMIT 1
         ) bike ON true
         LEFT JOIN LATERAL (
             SELECT TO_CHAR(p.week_start, 'YYYY-MM-DD') AS week_start, p.net_payout::float8 AS net_payout
             FROM payout_items p
             WHERE p.rider_id = r.rider_id
             ORDER BY p.week_start DESC
             LIMIT 1
         ) payout ON true
         LEFT JOIN LATERAL (
             SELECT COUNT(*)::int AS open_count, SUM(e.amount)::float8 AS open_amount
             FROM rider_escalations e
             WHERE e.rider_id = r.rider_id AND e.status = 'Open'
         ) escalation ON true
         ${MY_RIDERS_WHERE}
         ORDER BY COALESCE(payout.net_payout, 0) < 0 DESC, r.name, r.rider_id
         LIMIT $3 OFFSET $4`,
        [userId, search, limit, offset]
    );

    return result.rows;
}

// Everything the critical queue rules need, one row per rider the team leader holds.
// km is the rider's total over [kmFrom, kmTo]; the service ranks it.
async function findQueueRows(client, { userId, kmFrom, kmTo }) {
    const result = await client.query(
        `SELECT r.rider_id, r.name, r.phone, r.status,
                payout.net_payout AS last_net_payout,
                money.open_count AS open_money_escalations,
                money.open_amount AS open_money_amount,
                money.locked,
                promise.promise_date,
                promise.promise_amount,
                last_call.created_at AS last_follow_up_at,
                bike.has_bike,
                km.total_km
         FROM team_leader_riders l
         JOIN riders r ON r.rider_id = l.rider_id
         LEFT JOIN LATERAL (
             SELECT p.net_payout::float8 AS net_payout
             FROM payout_items p
             WHERE p.rider_id = r.rider_id
             ORDER BY p.week_start DESC
             LIMIT 1
         ) payout ON true
         LEFT JOIN LATERAL (
             SELECT COUNT(*)::int AS open_count,
                    SUM(e.amount)::float8 AS open_amount,
                    COALESCE(bool_or(e.lock_status = 'Locked'), false) AS locked
             FROM rider_escalations e
             WHERE e.rider_id = r.rider_id AND e.status = 'Open' AND e.kind <> 'Record'
         ) money ON true
         LEFT JOIN LATERAL (
             SELECT TO_CHAR(f.promise_date, 'YYYY-MM-DD') AS promise_date, f.promise_amount::float8 AS promise_amount
             FROM rider_follow_ups f
             WHERE f.rider_id = r.rider_id AND ${OPEN_PROMISE}
             ORDER BY f.created_at DESC, f.follow_up_id DESC
             LIMIT 1
         ) promise ON true
         LEFT JOIN LATERAL (
             SELECT MAX(f.created_at) AS created_at
             FROM rider_follow_ups f
             WHERE f.rider_id = r.rider_id
         ) last_call ON true
         LEFT JOIN LATERAL (
             SELECT EXISTS (
                 SELECT 1 FROM bike_assignments a
                 WHERE a.rider_id = r.rider_id AND a.returned_at IS NULL
             ) AS has_bike
         ) bike ON true
         LEFT JOIN LATERAL (
             SELECT COALESCE(SUM(d.daily_km), 0)::float8 AS total_km
             FROM daily_km_records d
             WHERE d.rider_id = r.rider_id AND d.usage_date BETWEEN $2 AND $3
         ) km ON true
         WHERE l.user_id = $1 AND l.removed_at IS NULL`,
        [userId, kmFrom, kmTo]
    );

    return result.rows;
}

async function countMyRiders(client, { userId, search }) {
    const result = await client.query(
        `SELECT COUNT(*)::int AS total ${MY_RIDERS_FROM} ${MY_RIDERS_WHERE}`,
        [userId, search]
    );

    return result.rows[0].total;
}

module.exports = {
    findUser,
    isAssigned,
    insertLink,
    removeLink,
    removeAllForUser,
    findRiderTeamLeaders,
    findTeamLeaders,
    findMyRiders,
    countMyRiders,
    findQueueRows
};
