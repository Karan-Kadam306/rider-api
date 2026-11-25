
const { pool } = require('../db');
const riderRepository = require('../repositories/riderRepository');
const bikeAssignmentRepository = require('../repositories/bikeAssignmentRepository');
const riderSessionRepository = require('../repositories/riderSessionRepository');
const escalationService = require('./escalationService');

// Fetch one rider by ID.
async function getRiderById(riderId) {
    return riderRepository.findById(riderId);
}

// Create Rider
async function createRider({ rider_id, name, phone }) {
    return riderRepository.createRider({
        rider_id,
        name,
        phone
    });
}

// update the Rider
async function updateRider({ riderId, name, phone, status }) {
    const existingRider = await riderRepository.findById(riderId);

    if (!existingRider) {
        return { type: 'not_found', rider: null };
    }

    if (existingRider.status === 'Terminated') {
        return { type: 'already_terminated', rider: existingRider };
    }

    const rider = await riderRepository.updateRider({
        riderId,
        name,
        phone,
        status
    });

    if (!rider) {
        return { type: 'conflict', rider: null };
    }

    // App sessions belong to the phone, so the old number is signed out of the rider app.
    if (rider.phone !== existingRider.phone) {
        await riderSessionRepository.revokeAllForPhone(pool, { phone: existingRider.phone });
    }

    return { type: 'updated', rider };
}

// Fetch a paginated list of riders.
async function getRiders({
    whereClause,
    values,
    sortColumn,
    sortOrder,
    limit,
    offset
}) {
    const [totalRecords, riders] = await Promise.all([
        riderRepository.countRiders({
            whereClause,
            values
        }),
        riderRepository.findRiders({
            whereClause,
            values,
            sortColumn,
            sortOrder,
            limit,
            offset
        })
    ]);

    return {
        totalRecords,
        riders
    };
}

// Terminate a rider and return their bike if they have one assigned.
async function terminateRider(riderId) {
    // Check whether the rider exists.
    const existingRider = await riderRepository.findById(riderId);

    if (!existingRider) {
        return {
            type: 'not_found',
            rider: null
        };
    }

    // Prevent terminating a rider who is already terminated.
    if (existingRider.status === 'Terminated') {
        return {
            type: 'already_terminated',
            rider: existingRider
        };
    }

    // Terminate the rider and return their bike in one transaction.
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Terminate an Active or Inactive rider.
        const rider = await riderRepository.terminateRider(client, riderId);

        if (!rider) {
            await client.query('ROLLBACK');

            return {
                type: 'conflict',
                rider: null
            };
        }

        // A terminated rider cannot use the rider app.
        await riderSessionRepository.revokeAllForPhone(client, { phone: rider.phone });

        const activeAssignment =
            await bikeAssignmentRepository.findActiveAssignmentByRider(
                client,
                riderId
            );

        // Close the assignment and make the bike Available for a new rider.
        const returnedAssignment = activeAssignment
            ? await bikeAssignmentRepository.returnBike(
                client,
                activeAssignment.bike_id
            )
            : null;

        await client.query('COMMIT');

        // The returned bike goes to another rider, so any escalation lock on it is released.
        if (returnedAssignment) {
            await escalationService.releaseLocksForReturnedBike(returnedAssignment.bike_id);
        }

        return {
            type: 'terminated',
            rider,
            returnedAssignment
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// Get a summary of rider statuses, including counts of Active, Inactive, and Terminated riders.
async function getRiderStatusSummary() {
    const rows = await riderRepository.getRiderStatusSummary();

    const summary = {
        Active: 0,
        Inactive: 0,
        Terminated: 0
    };

    for (const row of rows) {
        summary[row.status] = Number(row.total);
    }

    summary.total =
        summary.Active +
        summary.Inactive +
        summary.Terminated;

    return summary;
}

module.exports = {
    getRiderById,
    getRiders,
    createRider,
    updateRider,
    terminateRider,
    getRiderStatusSummary
};
