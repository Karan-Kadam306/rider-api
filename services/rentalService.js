
const { pool } = require('../db');
const rentalRepository = require('../repositories/rentalRepository');
const {
    calculateWeeklyRental
} = require('../utils/calculateWeeklyRental');

async function calculateRiderWeeklyRental({
    riderId,
    weekStart
}) {
    const client = await pool.connect();

    try {
        const riderResult = await client.query(
            `SELECT rider_id, status, terminated_on
             FROM riders
             WHERE rider_id = $1`,
            [riderId]
        );

        if (riderResult.rows.length === 0) {
            throw new Error(`Rider not found: ${riderId}`);
        }

        const rider = riderResult.rows[0];

        const terminatedOn = rider.terminated_on
            ? rider.terminated_on.toISOString().slice(0, 10)
            : null;

        if (rider.status === 'Terminated' && !terminatedOn) {
            throw new Error(
                `Cannot calculate rental: terminated date is missing for rider ${riderId}`
            );
        }

        const dates =
            await rentalRepository.findRentalDatesWithAssignmentCounts(
                client,
                { riderId, weekStart }
            );

        const eligibleDates = dates
            .filter(date => date.assignmentCount === 1)
            .map(date => date.date);

        const invalidDates = dates
            .filter(date => date.assignmentCount > 1)
            .map(date => date.date);

        const result = calculateWeeklyRental({
            weekStart,
            riderStatus: rider.status,
            terminatedOn,
            eligibleDates
        });

        const reviewDates = invalidDates.map(date => ({
            date,
            reason: 'Multiple assignments overlap this date'
        }));

        return {
            ...result,
            reviewDates,
            requiresReview: reviewDates.length > 0
        };
    } finally {
        client.release();
    }
}

module.exports = {
    calculateRiderWeeklyRental
};
