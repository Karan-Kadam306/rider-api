const { pool } = require('../db');
const energyRepository = require('../repositories/energyRepository');
const {
    calculateEnergyCharge
} = require('../utils/calculateEnergyCharge');

async function calculateWeeklyEnergyCharges({ weekStart, includeAllStatuses = false }) {
    const client = await pool.connect();
    // The following try-finally block ensures that the database client is released back to the pool after the operation, regardless of success or failure.
    try {
        const records =
            await energyRepository.findValidatedDailyKmRecords(client, {
                weekStart,
                includeAllStatuses
            });
        // The results object is initialized to keep track of the processing outcomes, including counts of processed, charged, and skipped records, as well as the total energy charge and detailed information for each record.
        const results = {
            weekStart,
            processedRecords: records.length,
            chargedRecords: 0,
            skippedRecords: 0,
            totalEnergyCharge: 0,
            details: []
        };
        // The following loop processes each validated daily KM record to determine if it is eligible for energy charge calculation.
        for (const record of records) {
            const skip = reason => {
                results.skippedRecords++;

                results.details.push({
                    kmRecordId: record.km_record_id,
                    usageDate: record.usage_date,
                    riderId: record.rider_id,
                    dailyKm: Number(record.daily_km),
                    eligible: false,
                    energyCharge: 0,
                    reason
                });
            };
            
            // Learning: The following checks are performed in order to determine if a record is eligible for energy charge calculation. 
            // If any check fails, the record is skipped and the reason is recorded.(Noticed the validation checks are performed in a specific order to ensure that the most critical issues are addressed first
            // 1. Check if the record status is 'Validated'. If not, skip the record.
            if (record.status !== 'Validated') {
                skip(`Record status is ${record.status}; validation is required`);
                continue;
            }

            // 2. Check if the bikeId and riderId are present. If either is null, skip the record.
            if (record.bike_id == null || record.rider_id == null) {
                skip('Bike or rider is not matched');
                continue;
            }

            // 3. Check if the dailyKm is a valid non-negative number. If not, skip the record.
            const assignments =
                await energyRepository.findAssignmentsForUsageDate(client, {
                    bikeId: record.bike_id,
                    usageDate: record.usage_date
                });

            // 4. Check if there is exactly one assignment for the bike on the usage date. If not, skip the record.
            if (assignments.length !== 1) {
                skip(
                    assignments.length === 0
                        ? 'No assignment found for usage date'
                        : 'Multiple assignments overlap usage date'
                );
                continue;
            }

            // 5. Check if the assigned rider matches the rider in the record. If not, skip the record.
            const assignment = assignments[0];

            // 6. Check if the rider exists in the database. If not, skip the record.
            if (assignment.rider_id !== record.rider_id) {
                skip('Assigned rider does not match Daily KM rider');
                continue;
            }

            // 7. Check if the rider is terminated and if the usage date is after the termination date. If so, skip the record.
            const rider = await energyRepository.findRiderById(
                client,
                record.rider_id
            );

            if (!rider) {
                skip('Rider does not exist');
                continue;
            }

            if (
                rider.status === 'Terminated' &&
                !rider.terminated_on
            ) {
                skip('Terminated rider is missing termination date');
                continue;
            }

            if (
                rider.terminated_on &&
                record.usage_date > rider.terminated_on
            ) {
                skip('Usage date is after the termination date');
                continue;
            }
            
            // 8. If all checks pass, calculate the energy charge for the record and update the results accordingly.
            const charge = calculateEnergyCharge({
                dailyKm: record.daily_km,
                recordStatus: record.status,
                bikeId: record.bike_id,
                riderId: record.rider_id
            });

            if (!charge.eligible) {
                skip(charge.reason);
                continue;
            }

            results.chargedRecords++;
            results.totalEnergyCharge += charge.energyCharge;

            results.details.push({
                kmRecordId: record.km_record_id,
                usageDate: record.usage_date,
                riderId: record.rider_id,
                dailyKm: charge.dailyKm,
                eligible: true,
                energyCharge: charge.energyCharge
            });
        }

        results.totalEnergyCharge =
            Math.round(results.totalEnergyCharge * 100) / 100;

        return results;
    } finally {
        client.release();
    }
}

module.exports = {
    calculateWeeklyEnergyCharges
};
