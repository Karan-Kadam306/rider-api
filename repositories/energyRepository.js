// Find validated daily km records for a given week
async function findValidatedDailyKmRecords(client, {
    weekStart,
    includeAllStatuses = false,
    riderId = null
}) {
    // riderId is optional; null returns records for all riders.
    const result = await client.query(
        `SELECT
            km_record_id,
            reported_vin,
            bike_id,
            TO_CHAR(usage_date, 'YYYY-MM-DD') AS usage_date,
            daily_km,
            rider_id,
            status
         FROM daily_km_records
         WHERE usage_date >= $1::date
           AND usage_date < $1::date + INTERVAL '7 days'
           AND ($2::boolean = TRUE OR status = 'Validated')
           AND ($3::text IS NULL OR rider_id = $3)
         ORDER BY usage_date, km_record_id`,
        [weekStart, includeAllStatuses, riderId]
    );

    return result.rows;
}

async function findAssignmentsForUsageDate(client, {
    bikeId,
    usageDate
}) {
    const result = await client.query(
        `SELECT
            ba.assignment_id,
            ba.bike_id,
            ba.rider_id,
            ba.assigned_at,
            ba.returned_at
         FROM bike_assignments ba
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

async function findRiderById(client, riderId) {
    const result = await client.query(
        `SELECT rider_id, 
        status, 
        TO_CHAR(terminated_on, 'YYYY-MM-DD') AS terminated_on
         FROM riders
         WHERE rider_id = $1`,
        [riderId]
    );

    return result.rows[0] || null;
}

module.exports = {
    findValidatedDailyKmRecords,
    findAssignmentsForUsageDate,
    findRiderById
};
