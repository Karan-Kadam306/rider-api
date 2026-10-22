
async function findEligibleRentalDates(client, {
    riderId,
    weekStart
}) {
    const result = await client.query(
        `SELECT DISTINCT
            TO_CHAR(dates.charge_date::date, 'YYYY-MM-DD') AS eligible_date
         FROM generate_series(
            $2::date,
            $2::date + INTERVAL '6 days',
            INTERVAL '1 day'
         ) AS dates(charge_date)
         JOIN bike_assignments ba
            ON ba.rider_id = $1
           AND ba.assigned_at < dates.charge_date + INTERVAL '1 day'
           AND (
                ba.returned_at IS NULL
                OR ba.returned_at > dates.charge_date
           )
         ORDER BY eligible_date`,
        [riderId, weekStart]
    );

    return result.rows.map(row => row.eligible_date);
}

module.exports = {
    findEligibleRentalDates
};
