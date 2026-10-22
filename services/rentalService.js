
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

        if (
            rider.status === 'Terminated' &&
            !rider.terminated_on
        ) {
            throw new Error(
                `Cannot calculate rental: terminated date is missing for rider ${riderId}`
            );
        }

        if (
                rider.status === 'Inactive'
        ) {
            const inactiveCheck = await client.query(
                `SELECT 1
                 FROM rider_inactive_periods
                 WHERE rider_id = $1
                   AND approved = TRUE
                   AND start_date <= $3::date + INTERVAL '6 days'
                   AND end_date >= $2::date
                 LIMIT 1`,
                [riderId, weekStart, weekStart]
            );
            
            if (inactiveCheck.rows.length === 0) {
                throw new Error(
                `Rental requires review: inactive period is not approved for rider ${riderId}`
            );
        }
    }

        const eligibleDates =
            await rentalRepository.findEligibleRentalDates(client, {
                riderId,
                weekStart
            });

        const inactiveResult = await client.query(
            `SELECT start_date, end_date, approved
             FROM rider_inactive_periods
             WHERE rider_id = $1
               AND approved = TRUE
               AND start_date <= $2::date + INTERVAL '6 days'
               AND end_date >= $2::date`,
            [riderId, weekStart]
        );

        const inactivePeriods = inactiveResult.rows.map(period => ({
            startDate: period.start_date.toISOString().slice(0, 10),
            endDate: period.end_date.toISOString().slice(0, 10),
            approved: period.approved
        }));

        return calculateWeeklyRental({
            weekStart,
            riderStatus: rider.status,
            terminatedOn: rider.terminated_on
                ? rider.terminated_on.toISOString().slice(0, 10)
                : null,
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
