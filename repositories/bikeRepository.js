// Bike columns plus the rider currently holding the bike, if any.
const BIKE_SELECT = `
    SELECT
        b.bike_id,
        b.registration_number,
        b.chassis_number,
        b.status,
        b.created_at,
        ba.rider_id AS current_rider_id,
        r.name AS current_rider_name,
        ba.assigned_at
    FROM bikes b
    LEFT JOIN bike_assignments ba
        ON ba.bike_id = b.bike_id
       AND ba.returned_at IS NULL
    LEFT JOIN riders r
        ON r.rider_id = ba.rider_id`;

async function createBike(client, { registrationNumber, chassisNumber }) {
    const result = await client.query(
        `INSERT INTO bikes (registration_number, chassis_number)
         VALUES ($1, $2)
         RETURNING bike_id, registration_number, chassis_number, status, created_at`,
        [registrationNumber, chassisNumber]
    );

    return result.rows[0];
}

// status and search are optional filters.
async function findBikes(client, { status, search, limit, offset }) {
    const result = await client.query(
        `${BIKE_SELECT}
         WHERE ($1::text IS NULL OR b.status = $1)
           AND (
                $2::text IS NULL
                OR b.registration_number ILIKE $2
                OR b.chassis_number ILIKE $2
           )
         ORDER BY b.bike_id
         LIMIT $3 OFFSET $4`,
        [status, search, limit, offset]
    );

    return result.rows;
}

async function countBikes(client, { status, search }) {
    const result = await client.query(
        `SELECT COUNT(*) AS total
         FROM bikes b
         WHERE ($1::text IS NULL OR b.status = $1)
           AND (
                $2::text IS NULL
                OR b.registration_number ILIKE $2
                OR b.chassis_number ILIKE $2
           )`,
        [status, search]
    );

    return Number(result.rows[0].total);
}

async function findBikeById(client, bikeId) {
    const result = await client.query(
        `${BIKE_SELECT}
         WHERE b.bike_id = $1`,
        [bikeId]
    );

    return result.rows[0] ?? null;
}

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

// Number of bikes in each status.
async function getBikeStatusSummary(client) {
    const result = await client.query(
        `SELECT status, COUNT(*) AS total
         FROM bikes
         GROUP BY status`
    );

    return result.rows;
}

module.exports = {
    getBikeStatusSummary,
    createBike,
    findBikes,
    countBikes,
    findBikeById,
    updateBikeStatus
};
