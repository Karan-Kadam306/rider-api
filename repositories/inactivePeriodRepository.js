const PERIOD_COLUMNS = `inactive_period_id::int AS inactive_period_id,
                rider_id,
                TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
                TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date,
                approved,
                created_at`;

// A rider's inactive periods, latest first.
async function findByRider(client, { riderId }) {
    const result = await client.query(
        `SELECT ${PERIOD_COLUMNS}
         FROM rider_inactive_periods
         WHERE rider_id = $1
         ORDER BY start_date DESC, inactive_period_id DESC`,
        [riderId]
    );

    return result.rows;
}

async function findById(client, { riderId, periodId }) {
    const result = await client.query(
        `SELECT ${PERIOD_COLUMNS}
         FROM rider_inactive_periods
         WHERE rider_id = $1 AND inactive_period_id = $2`,
        [riderId, periodId]
    );

    return result.rows[0] ?? null;
}

// Approved periods that touch the Monday–Sunday week, for the rental calculation.
async function findApprovedInWeek(client, { riderId, weekStart }) {
    const result = await client.query(
        `SELECT TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
                TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date
         FROM rider_inactive_periods
         WHERE rider_id = $1
           AND approved
           AND start_date <= $2::date + 6
           AND end_date >= $2::date`,
        [riderId, weekStart]
    );

    return result.rows;
}

// Any period of the rider that shares at least one day with the given range.
async function findOverlapping(client, { riderId, startDate, endDate }) {
    const result = await client.query(
        `SELECT ${PERIOD_COLUMNS}
         FROM rider_inactive_periods
         WHERE rider_id = $1
           AND start_date <= $3::date
           AND end_date >= $2::date
         LIMIT 1`,
        [riderId, startDate, endDate]
    );

    return result.rows[0] ?? null;
}

async function insertPeriod(client, { riderId, startDate, endDate }) {
    const result = await client.query(
        `INSERT INTO rider_inactive_periods (rider_id, start_date, end_date)
         VALUES ($1, $2, $3)
         RETURNING ${PERIOD_COLUMNS}`,
        [riderId, startDate, endDate]
    );

    return result.rows[0];
}

// Returns null if the period does not exist or is already approved.
async function approvePeriod(client, { riderId, periodId }) {
    const result = await client.query(
        `UPDATE rider_inactive_periods
         SET approved = true
         WHERE rider_id = $1 AND inactive_period_id = $2 AND NOT approved
         RETURNING ${PERIOD_COLUMNS}`,
        [riderId, periodId]
    );

    return result.rows[0] ?? null;
}

// Returns the removed period, or null if it does not exist.
async function deletePeriod(client, { riderId, periodId }) {
    const result = await client.query(
        `DELETE FROM rider_inactive_periods
         WHERE rider_id = $1 AND inactive_period_id = $2
         RETURNING ${PERIOD_COLUMNS}`,
        [riderId, periodId]
    );

    return result.rows[0] ?? null;
}

module.exports = {
    findByRider,
    findById,
    findApprovedInWeek,
    findOverlapping,
    insertPeriod,
    approvePeriod,
    deletePeriod
};
