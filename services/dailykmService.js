
const { pool } = require('../db');
const AppError = require('../errors/AppError');
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

// Validate all matched Pending records for a usage date.
async function validateDailyKmRecords({ usageDate }) {
    const records = await dailyKmRepository.validatePendingRecords(
        pool,
        usageDate
    );

    return {
        validated: records.length,
        kmRecordIds: records.map(record => record.km_record_id)
    };
}

async function findDailyKmRecords({ usageDate, status }) {
    return dailyKmRepository.findRecords(pool, { usageDate, status });
}

// Resolve a Needs Review record by choosing the rider (and bike if the VIN was not matched).
async function resolveNeedsReviewRecord({
    recordId,
    bikeId,
    riderId,
    reason
}) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const record = await dailyKmRepository.findRecordByIdForUpdate(
            client,
            recordId
        );

        if (!record) {
            throw new AppError('Daily KM record not found', 404);
        }

        if (record.status !== 'Needs Review') {
            throw new AppError(
                `Only Needs Review records can be resolved; this record is ${record.status}`,
                409
            );
        }

        // A matched VIN already tells us the bike; bikeId is only for unmatched VINs.
        if (
            record.bike_id != null &&
            bikeId != null &&
            String(bikeId) !== String(record.bike_id)
        ) {
            throw new AppError(
                `Record is already matched to bike ${record.bike_id}`,
                409
            );
        }

        const resolvedBikeId = record.bike_id ?? bikeId;

        if (resolvedBikeId == null) {
            throw new AppError(
                'bikeId is required because the VIN is not matched to a bike',
                400
            );
        }

        const assignments =
            await dailyKmRepository.findAssignmentsForUsageDate(
                client,
                resolvedBikeId,
                record.usage_date
            );

        // The chosen rider must have held this bike on the usage date.
        if (!assignments.some(assignment => assignment.rider_id === riderId)) {
            throw new AppError(
                'Rider was not assigned this bike on the usage date. Fix the assignment history first',
                409
            );
        }

        const resolvedRecord = await dailyKmRepository.resolveRecord(client, {
            recordId,
            bikeId: resolvedBikeId,
            riderId
        });

        // Keep a trail of the manual billing decision.
        await dailyKmRepository.createAuditEntry(client, {
            recordId,
            previousKm: record.daily_km,
            correctedKm: record.daily_km,
            previousFile: record.source_file_name,
            correctedFile: record.source_file_name,
            correctionReason:
                `Needs Review resolved to bike ${resolvedBikeId}, rider ${riderId}: ${reason}`
        });

        await client.query('COMMIT');

        return resolvedRecord;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    processDailyKmUpload,
    validateDailyKmRecords,
    findDailyKmRecords,
    resolveNeedsReviewRecord
};
