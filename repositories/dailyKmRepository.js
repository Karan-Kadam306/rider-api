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

async function findAssignmentsForUsageDate(client, bikeId, usageDate) {
    const result = await client.query(
        `SELECT
            ba.assignment_id,
            ba.bike_id,
            ba.rider_id,
            ba.assigned_at,
            ba.returned_at,
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

module.exports = {
    findBikeByVin,
    findRecordByVinAndDate,
    createRecord,
    updateRecord,
    createAuditEntry,
    findAssignmentsForUsageDate
};
