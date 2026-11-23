// Repository functions for managing bikes in the database.
const BIKE_SELECT = `
    SELECT
        b.bike_id,
        b.registration_number,
        b.chassis_number,
        b.status,
        b.created_at,
        b.hub_id::int AS hub_id,
        h.name AS hub_name,
        ba.rider_id AS current_rider_id,
        r.name AS current_rider_name,
        ba.assigned_at
    FROM bikes b
    JOIN hubs h
        ON h.hub_id = b.hub_id
    LEFT JOIN bike_assignments ba
        ON ba.bike_id = b.bike_id
       AND ba.returned_at IS NULL
    LEFT JOIN riders r
        ON r.rider_id = ba.rider_id`;

async function createBike(client, { registrationNumber, chassisNumber, hubId }) {
    const result = await client.query(
        `INSERT INTO bikes (registration_number, chassis_number, hub_id)
         VALUES ($1, $2, $3)
         RETURNING bike_id`,
        [registrationNumber, chassisNumber, hubId]
    );

    return result.rows[0];
}

// status, search and hubId are optional filters.
async function findBikes(client, { status, search, hubId, limit, offset }) {
    const result = await client.query(
        `${BIKE_SELECT}
         WHERE ($1::text IS NULL OR b.status = $1)
           AND (
                $2::text IS NULL
                OR b.registration_number ILIKE $2
                OR b.chassis_number ILIKE $2
           )
           AND ($3::bigint IS NULL OR b.hub_id = $3)
         ORDER BY b.bike_id
         LIMIT $4 OFFSET $5`,
        [status, search, hubId, limit, offset]
    );

    return result.rows;
}

// Count the total number of bikes matching the optional filters.
async function countBikes(client, { status, search, hubId }) {
    const result = await client.query(
        `SELECT COUNT(*) AS total
         FROM bikes b
         WHERE ($1::text IS NULL OR b.status = $1)
           AND (
                $2::text IS NULL
                OR b.registration_number ILIKE $2
                OR b.chassis_number ILIKE $2
           )
           AND ($3::bigint IS NULL OR b.hub_id = $3)`,
        [status, search, hubId]
    );

    return Number(result.rows[0].total);
}

// Find a bike by its ID, including its current assignment and rider information if assigned.
async function findBikeById(client, bikeId) {
    const result = await client.query(
        `${BIKE_SELECT}
         WHERE b.bike_id = $1`,
        [bikeId]
    );

    return result.rows[0] ?? null;
}

// Update the status of a bike. Returns the updated bike record.
async function updateBikeStatus(client, bikeId, status) {
    const result = await client.query(
        `UPDATE bikes
         SET status = $1
         WHERE bike_id = $2
         RETURNING bike_id, registration_number, chassis_number, status, created_at`,
        [status, bikeId]
    );

    return result.rows[0] ?? null;
}

async function updateBikeHub(client, bikeId, hubId) {
    await client.query(
        `UPDATE bikes
         SET hub_id = $1
         WHERE bike_id = $2`,
        [hubId, bikeId]
    );
}

// Number of bikes in each status, optionally for one hub.
async function getBikeStatusSummary(client, { hubId = null } = {}) {
    const result = await client.query(
        `SELECT status, COUNT(*) AS total
         FROM bikes
         WHERE ($1::bigint IS NULL OR hub_id = $1)
         GROUP BY status`,
        [hubId]
    );

    return result.rows;
}

module.exports = {
    getBikeStatusSummary,
    createBike,
    findBikes,
    countBikes,
    findBikeById,
    updateBikeStatus,
    updateBikeHub
};
