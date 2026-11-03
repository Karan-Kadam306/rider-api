const { pool } = require('../db');
const AppError = require('../errors/AppError');
const rentalRepository = require('../repositories/rentalRepository');
const inactivePeriodRepository = require('../repositories/inactivePeriodRepository');
const {
    calculateWeeklyRental
} = require('../utils/calculateWeeklyRental');

// Calculates the weekly rental for a specific rider, considering their status and any termination date.
async function calculateRiderWeeklyRental({
    riderId,
    weekStart
}) {
    const client = await pool.connect();

    try {
        const riderResult = await client.query(
            `SELECT rider_id,
                    status,
                    TO_CHAR(terminated_on, 'YYYY-MM-DD') AS terminated_on
             FROM riders
             WHERE rider_id = $1`,
            [riderId]
        );

        if (riderResult.rows.length === 0) {
            throw new AppError(`Rider not found: ${riderId}`, 404);
        }

        const rider = riderResult.rows[0];

        const terminatedOn = rider.terminated_on;

        if (rider.status === 'Terminated' && !terminatedOn) {
            throw new AppError(
                `Cannot calculate rental: terminated date is missing for rider ${riderId}`,
                409
            );
        }

        const dates =
            await rentalRepository.findRentalDatesWithAssignmentCounts(
                client,
                { riderId, weekStart }
            );

        // Any assignment on a date makes it a rental day.
        // Bike changes on the same day are still charged only once.
        const eligibleDates = dates
            .filter(date => date.assignmentCount >= 1)
            .map(date => date.date);

        // Approved inactive days are not charged, even if a bike was assigned.
        const inactivePeriods = (
            await inactivePeriodRepository.findApprovedInWeek(client, { riderId, weekStart })
        ).map(period => ({
            startDate: period.start_date,
            endDate: period.end_date,
            approved: true
        }));

        return calculateWeeklyRental({
            weekStart,
            riderStatus: rider.status,
            terminatedOn,
            inactivePeriods,
            eligibleDates
        });
    } finally {
        client.release();
    }
}

module.exports = {
    calculateRiderWeeklyRental
};
