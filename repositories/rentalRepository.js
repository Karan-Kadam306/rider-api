
async function findRentalDatesWithAssignmentCounts(client, {
    riderId,
    weekStart
}) {
    const result = await client.query(
        `SELECT
            TO_CHAR(dates.charge_date::date, 'YYYY-MM-DD') AS charge_date,
            COUNT(ba.assignment_id)::int AS assignment_count
         FROM generate_series(
            $2::date,
            $2::date + INTERVAL '6 days',
            INTERVAL '1 day'
         ) AS dates(charge_date)
         LEFT JOIN bike_assignments ba
            ON ba.rider_id = $1
           AND ba.assigned_at < dates.charge_date + INTERVAL '1 day'
           AND (
                ba.returned_at IS NULL
                OR ba.returned_at > dates.charge_date
           )
         GROUP BY dates.charge_date
         ORDER BY dates.charge_date`,
        [riderId, weekStart]
    );

    return result.rows.map(row => ({
        date: row.charge_date,
        assignmentCount: row.assignment_count
    }));
}

module.exports = {
    findRentalDatesWithAssignmentCounts
};
