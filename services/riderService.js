
const riderRepository = require('../repositories/riderRepository');

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

    // Terminate an Active or Inactive rider.
    const rider = await riderRepository.terminateRider(riderId);

    if (!rider) {
        return {
            type: 'conflict',
            rider: null
        };
    }

    return {
        type: 'terminated',
        rider
    };
}

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
