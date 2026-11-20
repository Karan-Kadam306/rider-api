// Columns returned for a follow-up, with who logged it.
const FOLLOW_UP_COLUMNS = `
    f.follow_up_id::int AS follow_up_id, f.rider_id, f.escalation_id::int AS escalation_id,
    f.reason, f.outcome, f.note,
    TO_CHAR(f.promise_date, 'YYYY-MM-DD') AS promise_date, f.promise_amount::float8 AS promise_amount,
    f.created_at, f.user_id::int AS user_id, u.name AS user_name, u.role AS user_role`;

async function insertFollowUp(client, { riderId, userId, escalationId, reason, outcome, note, promiseDate, promiseAmount }) {
    const result = await client.query(
        `INSERT INTO rider_follow_ups
            (rider_id, user_id, escalation_id, reason, outcome, note, promise_date, promise_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING follow_up_id::int AS follow_up_id`,
        [riderId, userId, escalationId, reason, outcome, note, promiseDate, promiseAmount]
    );

    return result.rows[0].follow_up_id;
}

async function findById(client, { followUpId }) {
    const result = await client.query(
        `SELECT ${FOLLOW_UP_COLUMNS}
         FROM rider_follow_ups f
         JOIN users u ON u.user_id = f.user_id
         WHERE f.follow_up_id = $1`,
        [followUpId]
    );

    return result.rows[0] ?? null;
}

// The rider's follow-ups, newest first.
async function findByRider(client, { riderId, limit, offset }) {
    const result = await client.query(
        `SELECT ${FOLLOW_UP_COLUMNS}
         FROM rider_follow_ups f
         JOIN users u ON u.user_id = f.user_id
         WHERE f.rider_id = $1
         ORDER BY f.created_at DESC, f.follow_up_id DESC
         LIMIT $2 OFFSET $3`,
        [riderId, limit, offset]
    );

    return result.rows;
}

async function countByRider(client, { riderId }) {
    const result = await client.query(
        'SELECT COUNT(*)::int AS total FROM rider_follow_ups WHERE rider_id = $1',
        [riderId]
    );

    return result.rows[0].total;
}

module.exports = {
    insertFollowUp,
    findById,
    findByRider,
    countByRider
};
