require('dotenv').config();
const { pool } = require('./db');
const {
    calculateRiderWeeklyRental
} = require('./services/rentalService');

const WEEK_START = '2026-10-12';

async function runTests() {
    try {
        const ridersResult = await pool.query(
            `SELECT rider_id, status, terminated_on
             FROM riders
             WHERE status IN ('Active', 'Inactive', 'Terminated')
             ORDER BY status, rider_id`
        );

        const riders = ridersResult.rows;

        for (const status of ['Active', 'Inactive', 'Terminated']) {
            const rider = riders.find(
                item => item.status === status &&
                    (status !== 'Terminated' || item.terminated_on)
            );
            
            if (!rider) {
                console.log(`SKIP: No suitable ${status} rider found.`);
                continue;
            }

            console.log(`\nTesting ${status} rider: ${rider.rider_id}`);

            const result = await calculateRiderWeeklyRental({
                riderId: rider.rider_id,
                weekStart: WEEK_START
            });

            console.log(JSON.stringify(result, null, 2));

            if (result.riderStatus !== status) {
                throw new Error(
                    `Expected status ${status}, got ${result.riderStatus}`
                );
            }

            if (result.totalRental !== result.rentalDays * 59) {
                throw new Error('Rental total does not match rental days.');
            }

            console.log(`PASS: ${status} rider rental calculation`);
        }

        // Find a rider who changed bikes on the same day during this week.
        const overlapResult = await pool.query(
            `SELECT ba.rider_id
             FROM bike_assignments ba
             JOIN bike_assignments other
               ON other.rider_id = ba.rider_id
              AND other.assignment_id > ba.assignment_id
              AND other.assigned_at < ba.assigned_at::date
                    + INTERVAL '1 day'
              AND (
                    other.returned_at IS NULL
                    OR other.returned_at > ba.assigned_at::date
              )
             WHERE ba.assigned_at < $1::date + INTERVAL '7 days'
               AND (
                    ba.returned_at IS NULL
                    OR ba.returned_at > $1::date
               )
             GROUP BY ba.rider_id
             LIMIT 1`,
            [WEEK_START]
        );

        // Check if any overlapping assignments were found
        if (overlapResult.rows.length === 0) {
            console.log(
                '\nSKIP: No overlapping assignments found for this week.'
            );
        } else {
            const riderId = overlapResult.rows[0].rider_id;

            const result = await calculateRiderWeeklyRental({
                riderId,
                weekStart: WEEK_START
            });

            console.log(`\nOverlap test rider: ${riderId}`);
            console.log(JSON.stringify(result, null, 2));

            // A bike change day is still charged once at ₹59.
            if (
                result.rentalDays === 0 ||
                result.totalRental !== result.rentalDays * 59
            ) {
                throw new Error(
                    'Expected bike change day to be charged once at ₹59.'
                );
            }

            console.log('PASS: Bike change day charged once');
        }
    } catch (error) {
        console.error('\nTEST FAILED:', error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

runTests();
