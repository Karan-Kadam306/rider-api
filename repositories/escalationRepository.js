// Columns returned for an escalation, with its timeline (oldest first) as a JSON list.
const ESCALATION_COLUMNS = `
    e.escalation_id::int AS escalation_id, e.rider_id, e.kind, e.reasons, e.comment,
    e.amount::float8 AS amount, TO_CHAR(e.week_start, 'YYYY-MM-DD') AS week_start,
    e.status, e.lock_status, e.bike_id, e.lock_ref, e.payment_token, e.payment_ref,
    e.resolution_note, e.resolved_at, e.resolved_by, e.created_at, e.created_by`;

const EVENTS = `
    SELECT json_agg(
               json_build_object(
                   'eventType', ev.event_type,
                   'detail', ev.detail,
                   'userId', ev.user_id,
                   'createdAt', ev.created_at
               )
               ORDER BY ev.created_at, ev.event_id
           ) AS events
    FROM escalation_events ev
    WHERE ev.escalation_id = e.escalation_id`;

async function insertEscalation(client, { riderId, kind, reasons, comment, amount, weekStart, lockStatus, bikeId, paymentToken, createdBy }) {
    const result = await client.query(
        `INSERT INTO rider_escalations
            (rider_id, kind, reasons, comment, amount, week_start, lock_status, bike_id, payment_token, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING escalation_id::int AS escalation_id`,
        [riderId, kind, reasons, comment, amount, weekStart, lockStatus, bikeId, paymentToken, createdBy]
    );

    return result.rows[0].escalation_id;
}

async function insertEvent(client, { escalationId, eventType, detail = null, userId = null }) {
    await client.query(
        `INSERT INTO escalation_events (escalation_id, event_type, detail, user_id)
         VALUES ($1, $2, $3, $4)`,
        [escalationId, eventType, detail, userId]
    );
}

async function findById(client, { escalationId }) {
    const result = await client.query(
        `SELECT ${ESCALATION_COLUMNS}, ev.events
         FROM rider_escalations e
         LEFT JOIN LATERAL (${EVENTS}) ev ON true
         WHERE e.escalation_id = $1`,
        [escalationId]
    );

    return result.rows[0] ?? null;
}

async function findByToken(client, { paymentToken }) {
    const result = await client.query(
        `SELECT ${ESCALATION_COLUMNS}, r.name AS rider_name
         FROM rider_escalations e
         JOIN riders r ON r.rider_id = e.rider_id
         WHERE e.payment_token = $1`,
        [paymentToken]
    );

    return result.rows[0] ?? null;
}

// A rider's escalations, newest first; only the open ones when openOnly is set.
async function findByRider(client, { riderId, openOnly = false }) {
    const result = await client.query(
        `SELECT ${ESCALATION_COLUMNS}, ev.events
         FROM rider_escalations e
         LEFT JOIN LATERAL (${EVENTS}) ev ON true
         WHERE e.rider_id = $1
           AND (NOT $2 OR e.status = 'Open')
         ORDER BY e.created_at DESC, e.escalation_id DESC`,
        [riderId, openOnly]
    );

    return result.rows;
}

// Ends an Open escalation. Returns null when it is no longer Open, e.g. paid a moment ago.
async function resolveEscalation(client, { escalationId, status, paymentRef = null, note = null, userId = null }) {
    const result = await client.query(
        `UPDATE rider_escalations
         SET status = $2,
             payment_ref = COALESCE($3, payment_ref),
             resolution_note = $4,
             resolved_at = now(),
             resolved_by = $5
         WHERE escalation_id = $1
           AND status = 'Open'
         RETURNING escalation_id::int AS escalation_id, kind, lock_status, bike_id`,
        [escalationId, status, paymentRef, note, userId]
    );

    return result.rows[0] ?? null;
}

async function updateLock(client, { escalationIds, lockStatus, lockRef = null }) {
    await client.query(
        `UPDATE rider_escalations
         SET lock_status = $2,
             lock_ref = COALESCE($3, lock_ref)
         WHERE escalation_id = ANY($1::bigint[])`,
        [escalationIds, lockStatus, lockRef]
    );
}

// Escalations whose lock still holds this bike.
async function findLockedByBike(client, { bikeId }) {
    const result = await client.query(
        `SELECT escalation_id::int AS escalation_id
         FROM rider_escalations
         WHERE bike_id = $1 AND lock_status = 'Locked'`,
        [bikeId]
    );

    return result.rows.map(row => row.escalation_id);
}

module.exports = {
    insertEscalation,
    insertEvent,
    findById,
    findByToken,
    findByRider,
    resolveEscalation,
    updateLock,
    findLockedByBike
};
