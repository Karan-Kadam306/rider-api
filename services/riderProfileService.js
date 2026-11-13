const { pool } = require('../db');
const AppError = require('../errors/AppError');
const partnerRepository = require('../repositories/partnerRepository');
const bikeAssignmentRepository = require('../repositories/bikeAssignmentRepository');
const payoutRepository = require('../repositories/payoutRepository');
const billingService = require('./billingService');

function toPagination(page, limit) {
    page = Number(page);
    limit = Number(limit);

    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new AppError('Page must be a positive integer and the page limit must be 1 to 100', 400);
    }

    return { page, limit, offset: (page - 1) * limit };
}

async function findRiderOrThrow(riderId) {
    const rider = await partnerRepository.findRiderWithMappings(pool, { riderId });

    if (!rider) {
        throw new AppError('Rider Not Found', 404);
    }

    return rider;
}

function toAssignment(row) {
    return {
        assignmentId: row.assignment_id,
        bikeId: row.bike_id,
        chassisNumber: row.chassis_number,
        registrationNumber: row.registration_number,
        assignedAt: row.assigned_at,
        returnedAt: row.returned_at
    };
}

// This week's bill, or why it cannot be calculated yet (same as a bill that needs review).
async function findCurrentWeekBill(riderId) {
    const weekStart = billingService.currentWeekStart();

    try {
        return await billingService.getRiderBill({ riderId, weekStart });
    } catch (error) {
        if (!(error instanceof AppError)) {
            throw error;
        }

        return { riderId, weekStart, requiresReview: true, reason: error.message };
    }
}

// Everything the top of the rider page needs in one call.
async function getRiderProfile(riderId) {
    const rider = await findRiderOrThrow(riderId);

    const [[latestAssignment], currentWeekBill] = await Promise.all([
        bikeAssignmentRepository.findRiderAssignmentHistory(pool, riderId, 1, 0),
        findCurrentWeekBill(riderId)
    ]);

    // Last week's negative net carried into this week, as a positive amount owed.
    const outstandingBalance = currentWeekBill.requiresReview
        ? null
        : Math.max(0, -currentWeekBill.previousBalance);

    return {
        rider: {
            riderId: rider.rider_id,
            name: rider.name,
            phone: rider.phone,
            status: rider.status,
            joinedAt: rider.created_at,
            terminatedOn: rider.terminated_on
        },
        currentAssignment: latestAssignment && !latestAssignment.returned_at
            ? toAssignment(latestAssignment)
            : null,
        partnerMappings: rider.mappings ?? [],
        currentWeekBill,
        outstandingBalance
    };
}

// The rider's paid weeks, newest first.
async function getRiderPayouts(riderId, page = 1, limit = 10) {
    const pagination = toPagination(page, limit);
    await findRiderOrThrow(riderId);

    const [rows, totalRecords] = await Promise.all([
        payoutRepository.findRiderItems(pool, { riderId, limit: pagination.limit, offset: pagination.offset }),
        payoutRepository.countRiderItems(pool, { riderId })
    ]);

    return {
        pagination: { ...pagination, totalRecords, totalPages: Math.ceil(totalRecords / pagination.limit) },
        payouts: rows.map(row => ({
            weekStart: row.week_start,
            rentalDays: row.rental_days,
            totalRental: row.total_rental,
            totalKm: row.total_km,
            totalEnergyCharge: row.total_energy_charge,
            totalAmount: row.total_amount,
            earnings: row.total_earnings,
            netPayout: row.net_payout,
            updatedAt: row.updated_at
        }))
    };
}

// The bikes the rider has held, newest first.
async function getRiderAssignments(riderId, page = 1, limit = 10) {
    const pagination = toPagination(page, limit);
    await findRiderOrThrow(riderId);

    const [rows, totalRecords] = await Promise.all([
        bikeAssignmentRepository.findRiderAssignmentHistory(pool, riderId, pagination.limit, pagination.offset),
        bikeAssignmentRepository.countRiderAssignmentHistory(pool, riderId)
    ]);

    return {
        pagination: { ...pagination, totalRecords, totalPages: Math.ceil(totalRecords / pagination.limit) },
        assignments: rows.map(toAssignment)
    };
}

module.exports = {
    getRiderProfile,
    getRiderPayouts,
    getRiderAssignments
};
