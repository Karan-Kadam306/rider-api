const { pool } = require('../db');
const dailyKmRepository = require('../repositories/dailyKmRepository');
const riderService = require('./riderService');
const bikeService = require('./bikeService');
const billingService = require('./billingService');

const TOP_RIDER_LIMIT = 5;

function addDays(date, days) {
    const result = new Date(`${date}T00:00:00.000Z`);
    result.setUTCDate(result.getUTCDate() + days);
    return result.toISOString().slice(0, 10);
}

// Daily KM counts by status for the week, with zero for missing statuses.
async function getDailyKmSummary({ weekStart, weekEnd }) {
    const rows = await dailyKmRepository.countRecordsByStatus(pool, {
        fromDate: weekStart,
        toDate: weekEnd
    });

    const summary = {
        Pending: 0,
        Validated: 0,
        'Needs Review': 0
    };

    for (const row of rows) {
        summary[row.status] = Number(row.total);
    }

    summary.total =
        summary.Pending +
        summary.Validated +
        summary['Needs Review'];

    return summary;
}

// Everything the admin dashboard shows for one billing week, in one call.
async function getDashboard({ weekStart }) {
    const weekEnd = addDays(weekStart, 6);

    const [riders, bikes, billing, dailyKm] = await Promise.all([
        riderService.getRiderStatusSummary(),
        bikeService.getBikeStatusSummary(),
        billingService.getWeeklyBillingSummary({ weekStart }),
        getDailyKmSummary({ weekStart, weekEnd })
    ]);

    const billedRiders = billing.riders.filter(rider => !rider.requiresReview);

    const changedSinceClose = billing.closed
        ? billing.riders
            .filter(rider => rider.changedSinceClose)
            .map(rider => ({
                riderId: rider.riderId,
                billedAmount: rider.billed?.totalAmount ?? null,
                currentAmount: rider.requiresReview ? null : rider.totalAmount,
                difference: rider.difference
            }))
        : [];

    return {
        weekStart,
        weekEnd,
        riders,
        bikes,
        billing: {
            closed: billing.closed,
            closedAt: billing.closedAt ?? null,
            billedTotalAmount: billing.billedTotalAmount ?? null,
            riderCount: billing.riderCount,
            totalRental: billing.totalRental,
            totalKm: billing.totalKm,
            totalEnergyCharge: billing.totalEnergyCharge,
            totalAmount: billing.totalAmount
        },
        dailyKm,
        attention: {
            ridersNeedingReview: billing.reviewCount,
            kmNeedsReview: dailyKm['Needs Review'],
            kmPending: dailyKm.Pending,
            changedSinceClose: changedSinceClose.length
        },
        topRiders: [...billedRiders]
            .sort((a, b) => b.totalAmount - a.totalAmount)
            .slice(0, TOP_RIDER_LIMIT)
            .map(rider => ({
                riderId: rider.riderId,
                riderStatus: rider.riderStatus,
                rentalDays: rider.rentalDays,
                totalKm: rider.totalKm,
                totalAmount: rider.totalAmount
            })),
        ridersNeedingReview: billing.riders
            .filter(rider => rider.requiresReview)
            .map(rider => ({ riderId: rider.riderId, reason: rider.reason })),
        changedSinceClose
    };
}

module.exports = {
    getDashboard
};
