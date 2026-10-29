const { pool } = require('../db');

// Find a rider by their ID. Returns null if the rider does not exist.
async function findById(riderId) {
    const result = await pool.query(
        `SELECT rider_id, name, phone, status
         FROM riders
         WHERE rider_id = $1`,
        [riderId]
    );

    return result.rows[0] ?? null;
}

// Find riders based on optional filters.
async function findRiders({
    whereClause,
    values,
    sortColumn,
    sortOrder,
    limit,
    offset
}) {
    const dataValues = [...values, limit, offset];

    const result = await pool.query(
        `SELECT rider_id, name, phone, status, created_at
         FROM riders
         ${whereClause}
         ORDER BY ${sortColumn} ${sortOrder}, rider_id DESC
         LIMIT $${dataValues.length - 1}
         OFFSET $${dataValues.length}`,
        dataValues
    );

    return result.rows;
}

// Count the total number of riders matching the optional filters.
async function countRiders({ whereClause, values }) {
    const result = await pool.query(
        `SELECT COUNT(*) AS total
         FROM riders
         ${whereClause}`,
        values
    );

    return Number(result.rows[0].total);
}

// Create a new rider.
async function createRider({ rider_id, name, phone }) {
    const result = await pool.query(
        `INSERT INTO riders (rider_id, name, phone)
         VALUES ($1, $2, $3)
         RETURNING rider_id, name, phone, status, created_at`,
        [rider_id, name, phone]
    );

    return result.rows[0];
}

// Update an existing rider.
async function updateRider({ riderId, name, phone, status }) {
    const result = await pool.query(
        `UPDATE riders
         SET name = $1,
             phone = $2,
             status = $3
         WHERE rider_id = $4
         RETURNING rider_id, name, phone, status, created_at`,
        [name, phone, status, riderId]
    );

    return result.rows[0] ?? null;
}

// Terminate a rider by setting their status to 'Terminated' and recording the termination date.
async function terminateRider(client, riderId) {
    const result = await client.query(
        `UPDATE riders
         SET status = 'Terminated',
             terminated_on = CURRENT_DATE
         WHERE rider_id = $1
           AND status IN ('Active', 'Inactive')
         RETURNING rider_id, name, phone, status, created_at,
                   TO_CHAR(terminated_on, 'YYYY-MM-DD') AS terminated_on`,
        [riderId]
    );

    return result.rows[0] ?? null;
}

// Get a summary of the number of riders in each status.
async function getRiderStatusSummary() {
    const result = await pool.query(
        `SELECT status, COUNT(*) AS total
         FROM riders
         GROUP BY status`
    );

    return result.rows;
}

module.exports = {
    findById,
    findRiders,
    countRiders,
    createRider,
    updateRider,
    terminateRider,
    getRiderStatusSummary
};
