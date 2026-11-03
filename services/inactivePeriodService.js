const { pool } = require('../db');
const AppError = require('../errors/AppError');
const riderRepository = require('../repositories/riderRepository');
const inactivePeriodRepository = require('../repositories/inactivePeriodRepository');
const validateUsageDate = require('../utils/validateUsageDate');

function isPositiveInteger(value) {
    return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function toPeriod(row) {
    return {
        periodId: row.inactive_period_id,
        riderId: row.rider_id,
        startDate: row.start_date,
        endDate: row.end_date,
        approved: row.approved,
        createdAt: row.created_at
    };
}

async function findRiderOrThrow(riderId) {
    const rider = await riderRepository.findById(riderId);

    if (!rider) {
        throw new AppError(`Rider not found: ${riderId}`, 404);
    }

    return rider;
}

function checkPeriodId(periodId) {
    if (!isPositiveInteger(periodId)) {
        throw new AppError('A valid periodId is required', 400);
    }
}

// A rider's inactive periods, latest first.
async function listPeriods({ riderId }) {
    await findRiderOrThrow(riderId);

    const rows = await inactivePeriodRepository.findByRider(pool, { riderId });
    return rows.map(toPeriod);
}

// Request an inactive period. It stays Pending (still charged) until approved.
async function createPeriod({ riderId, startDate, endDate }) {
    if (!validateUsageDate(startDate) || !validateUsageDate(endDate)) {
        throw new AppError('startDate and endDate must be valid dates in YYYY-MM-DD format', 400);
    }

    if (endDate < startDate) {
        throw new AppError('endDate cannot be before startDate', 400);
    }

    const rider = await findRiderOrThrow(riderId);

    if (rider.status === 'Terminated') {
        throw new AppError('Cannot add an inactive period for a terminated rider', 409);
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // One request per rider at a time, so two overlapping periods cannot both be saved.
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('inactive:' || $1))`, [riderId]);

        const overlap = await inactivePeriodRepository.findOverlapping(client, { riderId, startDate, endDate });

        if (overlap) {
            throw new AppError(
                `Overlaps the existing inactive period ${overlap.start_date} to ${overlap.end_date}`,
                409
            );
        }

        const row = await inactivePeriodRepository.insertPeriod(client, { riderId, startDate, endDate });

        await client.query('COMMIT');

        return toPeriod(row);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// Approve a period; from then on its days are not charged rental.
async function approvePeriod({ riderId, periodId }) {
    checkPeriodId(periodId);
    await findRiderOrThrow(riderId);

    const row = await inactivePeriodRepository.approvePeriod(pool, { riderId, periodId });

    if (row) {
        return toPeriod(row);
    }

    const existing = await inactivePeriodRepository.findById(pool, { riderId, periodId });

    if (!existing) {
        throw new AppError('Inactive period not found', 404);
    }

    throw new AppError('Inactive period is already approved', 409);
}

// Remove a period (approved or not); its days are charged again if a bike was assigned.
async function deletePeriod({ riderId, periodId }) {
    checkPeriodId(periodId);
    await findRiderOrThrow(riderId);

    const row = await inactivePeriodRepository.deletePeriod(pool, { riderId, periodId });

    if (!row) {
        throw new AppError('Inactive period not found', 404);
    }

    return toPeriod(row);
}

module.exports = {
    listPeriods,
    createPeriod,
    approvePeriod,
    deletePeriod
};
