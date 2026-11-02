//const { pool } = require('../db');

// Find a bike using the VIN from the uploaded CSV.
async function findBikeByVin(client, vin) {
    const result = await client.query(
        `SELECT bike_id, chassis_number
         FROM bikes
         WHERE chassis_number = $1`,
        [vin]
    );

    return result.rows[0] ?? null;
}

// Find the existing KM record for a VIN and usage date.
// FOR UPDATE locks the record while the transaction processes it.
async function findRecordByVinAndDate(client, vin, usageDate) {
    const result = await client.query(
        `SELECT
            km_record_id,
            reported_vin,
            bike_id,
            usage_date,
            daily_km,
            rider_id,
            status,
            source_file_name
         FROM daily_km_records
         WHERE reported_vin = $1
           AND usage_date = $2
         FOR UPDATE`,
        [vin, usageDate]
    );

    return result.rows[0] ?? null;
}

// Insert a new daily KM record.
async function createRecord(client, {
    vin,
    bikeId,
    usageDate,
    dailyKm,
    riderId,
    status,
    fileName
}) {
    const result = await client.query(
        `INSERT INTO daily_km_records (
            reported_vin,
            bike_id,
            usage_date,
            daily_km,
            rider_id,
            status,
            source_file_name
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
            vin,
            bikeId,
            usageDate,
            dailyKm,
            riderId,
            status,
            fileName
        ]
    );

    return result.rows[0];
}

// Update an existing record when its KM value changes.
async function updateRecord(client, {
    recordId,
    bikeId,
    dailyKm,
    riderId,
    status,
    fileName
}) {
    const result = await client.query(
        `UPDATE daily_km_records
         SET bike_id = $1,
             daily_km = $2,
             rider_id = $3,
             status = $4,
             source_file_name = $5
         WHERE km_record_id = $6
         RETURNING *`,
        [
            bikeId,
            dailyKm,
            riderId,
            status,
            fileName,
            recordId
        ]
    );

    return result.rows[0] ?? null;
}

// Save the previous and corrected values in the audit table.
async function createAuditEntry(client, {
    recordId,
    previousKm,
    correctedKm,
    previousFile,
    correctedFile,
    correctionReason
}) {
    const result = await client.query(
        `INSERT INTO daily_km_audit (
            km_record_id,
            previous_daily_km,
            corrected_daily_km,
            previous_source_file,
            corrected_source_file,
            correction_reason
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
            recordId,
            previousKm,
            correctedKm,
            previousFile,
            correctedFile,
            correctionReason
        ]
    );

    return result.rows[0];
}

// Find all assignments for a bike on a given usage date.
async function findAssignmentsForUsageDate(client, bikeId, usageDate) {
    const result = await client.query(
        `SELECT
            ba.assignment_id,
            ba.bike_id,
            ba.rider_id,
            ba.assigned_at,
            ba.returned_at,
            r.name AS rider_name,
            r.status AS rider_status
         FROM bike_assignments ba
         JOIN riders r
            ON r.rider_id = ba.rider_id
         WHERE ba.bike_id = $1
           AND ba.assigned_at < ($2::date + INTERVAL '1 day')
           AND (
                ba.returned_at IS NULL
                OR ba.returned_at > $2::date
           )
         ORDER BY ba.assigned_at`,
        [bikeId, usageDate]
    );

    return result.rows;
}

// Mark matched Pending records with usage dates in [fromDate, toDate] as Validated.
// Needs Review records are left untouched.
async function validatePendingRecords(client, { fromDate, toDate }) {
    const result = await client.query(
        `UPDATE daily_km_records
         SET status = 'Validated'
         WHERE usage_date BETWEEN $1::date AND $2::date
           AND status = 'Pending'
           AND bike_id IS NOT NULL
           AND rider_id IS NOT NULL
         RETURNING km_record_id`,
        [fromDate, toDate]
    );

    return result.rows;
}

// Shared filters for the Daily KM list: $1 fromDate, $2 toDate, $3 search pattern.
// Search matches the VIN, rider ID or rider name.
const LIST_FROM_WHERE = `
    FROM daily_km_records d
    LEFT JOIN bikes b ON b.bike_id = d.bike_id
    LEFT JOIN riders r ON r.rider_id = d.rider_id
    WHERE ($1::date IS NULL OR d.usage_date >= $1::date)
      AND ($2::date IS NULL OR d.usage_date <= $2::date)
      AND (
           $3::text IS NULL
           OR d.reported_vin ILIKE $3
           OR d.rider_id ILIKE $3
           OR r.name ILIKE $3
      )`;

// One page of daily KM records with the bike's chassis number and the rider's name.
async function findRecords(client, { fromDate, toDate, search, status, limit, offset }) {
    const result = await client.query(
        `SELECT
            d.km_record_id,
            d.reported_vin,
            d.bike_id,
            b.chassis_number,
            TO_CHAR(d.usage_date, 'YYYY-MM-DD') AS usage_date,
            d.daily_km,
            d.rider_id,
            r.name AS rider_name,
            d.status,
            d.source_file_name,
            d.uploaded_at
         ${LIST_FROM_WHERE}
           AND ($4::text IS NULL OR d.status = $4)
         ORDER BY d.usage_date DESC, d.km_record_id
         LIMIT $5 OFFSET $6`,
        [fromDate, toDate, search, status, limit, offset]
    );

    return result.rows;
}

// Records per status for the same filters (without the status filter),
// used for the status tab counts and the page total.
async function countListByStatus(client, { fromDate, toDate, search }) {
    const result = await client.query(
        `SELECT d.status, COUNT(*)::int AS total
         ${LIST_FROM_WHERE}
         GROUP BY d.status`,
        [fromDate, toDate, search]
    );

    return result.rows;
}

// Number of records in each status for usage dates in [fromDate, toDate].
async function countRecordsByStatus(client, { fromDate, toDate }) {
    const result = await client.query(
        `SELECT status, COUNT(*) AS total
         FROM daily_km_records
         WHERE usage_date BETWEEN $1::date AND $2::date
         GROUP BY status`,
        [fromDate, toDate]
    );

    return result.rows;
}

// Lock one record while it is being resolved.
async function findRecordByIdForUpdate(client, recordId) {
    const result = await client.query(
        `SELECT
            km_record_id,
            bike_id,
            TO_CHAR(usage_date, 'YYYY-MM-DD') AS usage_date,
            daily_km,
            rider_id,
            status,
            source_file_name
         FROM daily_km_records
         WHERE km_record_id = $1
         FOR UPDATE`,
        [recordId]
    );

    return result.rows[0] ?? null;
}

// Save the reviewer's bike/rider decision and validate the record.
async function resolveRecord(client, { recordId, bikeId, riderId }) {
    const result = await client.query(
        `UPDATE daily_km_records
         SET bike_id = $1,
             rider_id = $2,
             status = 'Validated'
         WHERE km_record_id = $3
         RETURNING km_record_id, reported_vin, bike_id,
                   TO_CHAR(usage_date, 'YYYY-MM-DD') AS usage_date,
                   daily_km, rider_id, status`,
        [bikeId, riderId, recordId]
    );

    return result.rows[0] ?? null;
}

module.exports = {
    findBikeByVin,
    findRecordByVinAndDate,
    createRecord,
    updateRecord,
    createAuditEntry,
    findAssignmentsForUsageDate,
    validatePendingRecords,
    findRecords,
    countRecordsByStatus,
    countListByStatus,
    findRecordByIdForUpdate,
    resolveRecord
};
