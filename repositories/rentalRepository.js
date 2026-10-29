// Repository functions for managing rentals in the database. These functions help retrieve rental information, including rental dates and assignment counts for riders.
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

// Riders who held a bike on at least one day of the week.
async function findRiderIdsWithAssignmentsInWeek(client, { weekStart }) {
    const result = await client.query(
        `SELECT DISTINCT rider_id
         FROM bike_assignments
         WHERE assigned_at < $1::date + INTERVAL '7 days'
           AND (
                returned_at IS NULL
                OR returned_at > $1::date
           )
         ORDER BY rider_id`,
        [weekStart]
    );

    return result.rows.map(row => row.rider_id);
}

module.exports = {
    findRentalDatesWithAssignmentCounts,
    findRiderIdsWithAssignmentsInWeek
};
