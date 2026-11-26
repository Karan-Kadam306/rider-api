const { pool } = require('../db');

// The rider's hub, read with a subquery so list filters can keep using bare rider columns.
const HUB_COLUMNS = `hub_id::int AS hub_id,
                (SELECT h.name FROM hubs h WHERE h.hub_id = riders.hub_id) AS hub_name,
                is_test`;

// Leaves out riders approved from an application who have not finished onboarding (deposit or
// bike still pending): the riders list and counts show them on the onboarding tabs instead.
const ONBOARDED_RIDERS = `NOT EXISTS (
                SELECT 1 FROM rider_applications a
                WHERE a.rider_id = riders.rider_id AND a.status IN ('Payment Pending', 'Bike Pending'))`;

// Find a rider by their ID. Returns null if the rider does not exist.
async function findById(riderId) {
    const result = await pool.query(
        `SELECT rider_id, name, phone, status, ${HUB_COLUMNS}
         FROM riders
         WHERE rider_id = $1`,
        [riderId]
    );

    return result.rows[0] ?? null;
}

// The rider with this phone, for rider app sign-in. Phones are unique.
async function findByPhone(client, phone) {
    const result = await client.query(
        `SELECT rider_id, name, phone, status
         FROM riders
         WHERE phone = $1`,
        [phone]
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
        `SELECT rider_id, name, phone, status, created_at, ${HUB_COLUMNS}
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

// Create a new rider, at approval of their application. Runs inside the approval transaction,
// which holds the hub's lock.
async function createRider(client, { riderId, name, phone, hubId, isTest, status }) {
    const result = await client.query(
        `INSERT INTO riders (rider_id, name, phone, hub_id, is_test, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING rider_id, name, phone, status, created_at, ${HUB_COLUMNS}`,
        [riderId, name, phone, hubId, isTest, status]
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
         RETURNING rider_id, name, phone, status, created_at, ${HUB_COLUMNS}`,
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
async function getRiderStatusSummary({ includeTest = true, hubId = null } = {}) {
    const result = await pool.query(
        `SELECT status, COUNT(*) AS total
         FROM riders
         WHERE ($1 OR NOT is_test)
           AND ($2::bigint IS NULL OR hub_id = $2)
           AND ${ONBOARDED_RIDERS}
         GROUP BY status`,
        [includeTest, hubId]
    );

    return result.rows;
}

module.exports = {
    ONBOARDED_RIDERS,
    findById,
    findByPhone,
    findRiders,
    countRiders,
    createRider,
    updateRider,
    terminateRider,
    getRiderStatusSummary
};
