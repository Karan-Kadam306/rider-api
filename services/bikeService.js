const { pool } = require('../db');
const AppError = require('../errors/AppError');
const bikeRepository = require('../repositories/bikeRepository');
const bikeAssignmentRepository = require('../repositories/bikeAssignmentRepository');

const allowedStatuses = ['Available', 'Assigned', 'Maintenance'];

function isPositiveInteger(value) {
    return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function validateBikeId(bikeId) {
    if (bikeId == null || !String(bikeId).trim() || !isPositiveInteger(bikeId)) {
        throw new AppError('A valid bikeId is required', 400);
    }
}

function mapBike(row) {
    return {
        bikeId: row.bike_id,
        registrationNumber: row.registration_number,
        chassisNumber: row.chassis_number,
        status: row.status,
        createdAt: row.created_at,
        currentRider: row.current_rider_id
            ? {
                riderId: row.current_rider_id,
                name: row.current_rider_name,
                assignedAt: row.assigned_at
            }
            : null
    };
}

async function createBike({ registrationNumber, chassisNumber }) {
    // chassisNumber is the VIN used to match Daily KM uploads.
    if (typeof chassisNumber !== 'string' || !chassisNumber.trim()) {
        throw new AppError('chassisNumber is required and must be a non-empty string', 400);
    }

    if (
        registrationNumber !== undefined &&
        (typeof registrationNumber !== 'string' || !registrationNumber.trim())
    ) {
        throw new AppError('registrationNumber must be a non-empty string', 400);
    }

    if (
        chassisNumber.trim().length > 50 ||
        (registrationNumber && registrationNumber.trim().length > 20)
    ) {
        throw new AppError('One or more bike fields exceed the allowed length', 400);
    }

    const bike = await bikeRepository.createBike(pool, {
        // Store registration numbers as MH12AB1234 (uppercase, no spaces).
        registrationNumber: registrationNumber
            ? registrationNumber.replace(/\s+/g, '').toUpperCase()
            : null,
        chassisNumber: chassisNumber.trim()
    });

    return mapBike(bike);
}

async function getBikes({ status, search, page = 1, limit = 20 }) {
    if (status !== undefined && !allowedStatuses.includes(status)) {
        throw new AppError(
            'Invalid status. Allowed values: Available, Assigned, Maintenance',
            400
        );
    }

    if (
        !isPositiveInteger(page) ||
        !isPositiveInteger(limit) ||
        Number(limit) > 100
    ) {
        throw new AppError(
            'Page must be a positive integer and limit must be between 1 and 100',
            400
        );
    }

    page = Number(page);
    limit = Number(limit);

    const offset = (page - 1) * limit;

    const filters = {
        status: status ?? null,
        search: typeof search === 'string' && search.trim()
            ? `%${search.trim()}%`
            : null
    };

    const [totalRecords, rows] = await Promise.all([
        bikeRepository.countBikes(pool, filters),
        bikeRepository.findBikes(pool, { ...filters, limit, offset })
    ]);

    return {
        pagination: {
            page,
            limit,
            offset,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limit)
        },
        count: rows.length,
        bikes: rows.map(mapBike)
    };
}

async function getBikeById(bikeId) {
    validateBikeId(bikeId);

    const bike = await bikeRepository.findBikeById(pool, bikeId);

    if (!bike) {
        throw new AppError('Bike not found', 404);
    }

    return mapBike(bike);
}

// Move a bike between Available and Maintenance.
// Assigned is set only by the assign/return flow.
async function updateBikeStatus(bikeId, status) {
    validateBikeId(bikeId);

    if (!['Available', 'Maintenance'].includes(status)) {
        throw new AppError(
            'Invalid status. Allowed values: Available, Maintenance',
            400
        );
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Lock the bike so it cannot be assigned while its status changes.
        const bike = await bikeAssignmentRepository.findBikeForUpdate(
            client,
            bikeId
        );

        if (!bike) {
            throw new AppError('Bike not found', 404);
        }

        if (bike.status === 'Assigned') {
            throw new AppError(
                'Bike is assigned to a rider. Return it before changing its status',
                409
            );
        }

        const updatedBike = await bikeRepository.updateBikeStatus(
            client,
            bikeId,
            status
        );

        await client.query('COMMIT');

        return mapBike(updatedBike);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// Bike counts by status, with zero for statuses that have no bikes.
async function getBikeStatusSummary() {
    const rows = await bikeRepository.getBikeStatusSummary(pool);

    const summary = {
        Available: 0,
        Assigned: 0,
        Maintenance: 0
    };

    for (const row of rows) {
        summary[row.status] = Number(row.total);
    }

    summary.total =
        summary.Available +
        summary.Assigned +
        summary.Maintenance;

    return summary;
}

module.exports = {
    getBikeStatusSummary,
    createBike,
    getBikes,
    getBikeById,
    updateBikeStatus
};
