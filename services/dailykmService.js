
const { pool } = require('../db');
const dailyKmRepository = require('../repositories/dailyKmRepository');

// Process validated daily KM records in one database transaction.
async function processDailyKmUpload({
    records,
    usageDate,
    fileName
}) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const results = {
            inserted: 0,
            unchanged: 0,
            corrected: 0,
            needsReview: 0
        };

        for (const record of records) {
            const vin = record.VIN.trim();
            const dailyKm = Number(record.KM);

            const bike = await dailyKmRepository.findBikeByVin(
                client,
                vin
            );

            const existingRecord =
                await dailyKmRepository.findRecordByVinAndDate(
                    client,
                    vin,
                    usageDate
                );

            let bikeId = bike?.bike_id ?? null;
            let riderId = null;
            let status = 'Needs Review';

            if (bike) {
                const assignments =
                    await dailyKmRepository.findAssignmentsForUsageDate(
                        client,
                        bike.bike_id,
                        usageDate
                    );

                // Only one assignment overlapping the usage date
                // gives us an unambiguous rider match.
                if (assignments.length === 1) {
                    riderId = assignments[0].rider_id;
                    status = 'Pending';
                }
            }

            if (!existingRecord) {
                await dailyKmRepository.createRecord(client, {
                    vin,
                    bikeId,
                    usageDate,
                    dailyKm,
                    riderId,
                    status,
                    fileName
                });

                results.inserted++;

                if (status === 'Needs Review') {
                    results.needsReview++;
                }

                continue;
            }

            const previousKm = Number(existingRecord.daily_km);

            // Identical re-upload: do not create duplicates or audit entries.
            if (previousKm === dailyKm) {
                results.unchanged++;
                continue;
            }

            // Preserve the previous and corrected KM values.
            await dailyKmRepository.createAuditEntry(client, {
                recordId: existingRecord.km_record_id,
                previousKm,
                correctedKm: dailyKm,
                previousFile: existingRecord.source_file_name,
                correctedFile: fileName,
                correctionReason: 'Automatic correction via re-upload'
            });

            await dailyKmRepository.updateRecord(client, {
                recordId: existingRecord.km_record_id,
                bikeId,
                dailyKm,
                riderId,
                status,
                fileName
            });

            results.corrected++;

            if (status === 'Needs Review') {
                results.needsReview++;
            }
        }

        await client.query('COMMIT');

        return results;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    processDailyKmUpload
};
