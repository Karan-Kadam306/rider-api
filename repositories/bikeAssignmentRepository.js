const AppError = require("../errors/AppError");

// Repository functions for managing bike assignments in the database.
async function findBikeForUpdate(client, bikeId) {
    const result = await client.query(
        `SELECT bike_id, registration_number, status
         FROM bikes
         WHERE bike_id = $1
         FOR UPDATE`,
        [bikeId]
    );

    return result.rows[0] ?? null;
}

// Create a new bike assignment record in the database.
async function createAssignment(client, bikeId, riderId) {
    const result = await client.query(
        `INSERT INTO bike_assignments (bike_id, rider_id)
         VALUES ($1, $2)
         RETURNING assignment_id, bike_id, rider_id, assigned_at`,
        [bikeId, riderId]
    );

    return result.rows[0];
}

// Find the active assignment for a specific rider. Returns null if no active assignment exists.
async function findActiveAssignmentByRider(client, riderId) {
    const result = await client.query(
        `SELECT assignment_id, bike_id
         FROM bike_assignments
         WHERE rider_id = $1
           AND returned_at IS NULL`,
        [riderId]
    );

    return result.rows[0] ?? null;
}

// Mark a bike as assigned in the database. Throws an error if the update fails.
async function markBikeAssigned(client, bikeId) {
    const result = await client.query(
        `UPDATE bikes
         SET status = 'Assigned'
         WHERE bike_id = $1`,
        [bikeId]
    );

    if (result.rowCount !== 1) {
        throw new Error("Bike status could not be updated");
    }
}

// Return a bike that is currently assigned to a rider. This function updates the bike's status and closes the active assignment record.
async function returnBike(client, bikeId) {
    // Lock the bike row before changing its status.
    const bikeResult = await client.query(
        `SELECT bike_id, status
         FROM bikes
         WHERE bike_id = $1
         FOR UPDATE`,
        [bikeId]
    );

    const bike = bikeResult.rows[0];

    if (!bike) {
        throw new AppError("Bike not found", 404);
    }

    if (bike.status !== "Assigned") {
        throw new AppError("Bike is not currently assigned", 409);
    }

    // Close the active assignment record.
    const assignmentResult = await client.query(
        `UPDATE bike_assignments
         SET returned_at = NOW()
         WHERE bike_id = $1
           AND returned_at IS NULL
         RETURNING assignment_id, bike_id, rider_id, returned_at`,
        [bikeId]
    );

    if (assignmentResult.rowCount !== 1) {
        throw new Error("Active assignment could not be found");
    }

    // Make the bike available again.
    await client.query(
        `UPDATE bikes
         SET status = 'Available'
         WHERE bike_id = $1`,
        [bikeId]
    );

    return assignmentResult.rows[0];
}

// Get the assignment history of a specific bike, with pagination support.
async function findAssignmentHistory(client, bikeId, limit, offset) {
    const result = await client.query(
        `SELECT
            ba.assignment_id,
            ba.bike_id,
            b.registration_number,
            ba.rider_id,
            r.name AS rider_name,
            ba.assigned_at,
            ba.returned_at
        FROM bike_assignments AS ba
        JOIN bikes AS b
            ON b.bike_id = ba.bike_id    
        JOIN riders as r
            ON r.rider_id = ba.rider_id
        WHERE ba.bike_id = $1
        ORDER BY ba.assigned_at DESC, ba.assignment_id DESC
        LIMIT $2 OFFSET $3`,
        [bikeId, limit, offset]
    );

    return result.rows;
}

// Count the total number of assignment history records for a specific bike.
async function countAssignmentHistory(client, bikeId) {
    const result = await client.query(
        `SELECT COUNT(*) AS total
        FROM bike_assignments
        WHERE bike_id = $1`,
        [bikeId]
    );

    return Number(result.rows[0].total);
}

module.exports = {
    findBikeForUpdate,
    createAssignment,
    findActiveAssignmentByRider,
    markBikeAssigned,
    returnBike,
    findAssignmentHistory,
    countAssignmentHistory
};
