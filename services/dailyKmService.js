
const { pool } = require('../db');
const AppError = require('../errors/AppError');
const dailyKmRepository = require('../repositories/dailyKmRepository');
const validateUsageDate = require('../utils/validateUsageDate');

// Save already-validated daily KM rows. Runs inside the caller's transaction
// (the import service), so the rows and the import log commit together.
async function processDailyKmRows(client, {
    rows,
    usageDate,
    fileName
}) {
    const results = {
        inserted: 0,
        unchanged: 0,
        corrected: 0,
        needsReview: 0
    };

    for (const row of rows) {
        const vin = row.VIN.trim();
        const dailyKm = Number(row.KM);

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

    return results;
}

const allowedStatuses = ['Pending', 'Validated', 'Needs Review'];

function isPositiveInteger(value) {
    return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

// Check a fromDate/toDate pair; with required, both must be given.
function checkDateRange({ fromDate, toDate }, { required = false } = {}) {
    for (const [name, value] of Object.entries({ fromDate, toDate })) {
        if ((required || value !== undefined) && !validateUsageDate(value)) {
            throw new AppError(`${name} must be a valid date in YYYY-MM-DD format`, 400);
        }
    }

    // YYYY-MM-DD strings compare correctly as text.
    if (fromDate && toDate && fromDate > toDate) {
        throw new AppError('fromDate must be on or before toDate', 400);
    }
}

// Validate all matched Pending records with usage dates in [fromDate, toDate].
async function validateDailyKmRecords({ fromDate, toDate }) {
    checkDateRange({ fromDate, toDate }, { required: true });

    const records = await dailyKmRepository.validatePendingRecords(
        pool,
        { fromDate, toDate }
    );

    return {
        validated: records.length,
        kmRecordIds: records.map(record => record.km_record_id)
    };
}

// Riders who held the bike on the usage date: the only riders a
// Needs Review record for that bike and date can be resolved to.
async function findRiderCandidates({ bikeId, usageDate }) {
    if (!isPositiveInteger(bikeId)) {
        throw new AppError('bikeId must be a positive integer', 400);
    }

    if (!validateUsageDate(usageDate)) {
        throw new AppError('usageDate must be a valid date in YYYY-MM-DD format', 400);
    }

    const assignments = await dailyKmRepository.findAssignmentsForUsageDate(
        pool,
        bikeId,
        usageDate
    );

    return assignments.map(assignment => ({
        riderId: assignment.rider_id,
        riderName: assignment.rider_name,
        riderStatus: assignment.rider_status,
        assignedAt: assignment.assigned_at,
        returnedAt: assignment.returned_at
    }));
}

// One page of records for a date range, plus per-status counts for the tabs.
// statusCounts ignore the status filter, so every tab shows its own total.
async function findDailyKmRecords({ fromDate, toDate, status, search, page = 1, limit = 20 }) {
    checkDateRange({ fromDate, toDate });

    if (status !== undefined && !allowedStatuses.includes(status)) {
        throw new AppError('Invalid status. Allowed values: Pending, Validated, Needs Review', 400);
    }

    if (!isPositiveInteger(page) || !isPositiveInteger(limit) || Number(limit) > 100) {
        throw new AppError(
            'Page must be a positive integer and limit must be between 1 and 100',
            400
        );
    }

    page = Number(page);
    limit = Number(limit);

    const offset = (page - 1) * limit;
    const filters = {
        fromDate: fromDate ?? null,
        toDate: toDate ?? null,
        search: typeof search === 'string' && search.trim()
            ? `%${search.trim()}%`
            : null
    };

    const [countRows, records] = await Promise.all([
        dailyKmRepository.countListByStatus(pool, filters),
        dailyKmRepository.findRecords(pool, { ...filters, status: status ?? null, limit, offset })
    ]);

    const statusCounts = Object.fromEntries(allowedStatuses.map(name => [name, 0]));

    for (const row of countRows) {
        statusCounts[row.status] = row.total;
    }

    const totalRecords = status
        ? statusCounts[status]
        : countRows.reduce((sum, row) => sum + row.total, 0);

    return {
        pagination: {
            page,
            limit,
            offset,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limit)
        },
        statusCounts,
        count: records.length,
        records
    };
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
    processDailyKmRows,
    validateDailyKmRecords,
    findRiderCandidates,
    findDailyKmRecords,
    resolveNeedsReviewRecord
};
