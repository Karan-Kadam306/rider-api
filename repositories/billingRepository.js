// Closure row for a week, or null if the week is still open.
async function findWeekClosure(client, { weekStart }) {
    const result = await client.query(
        `SELECT TO_CHAR(week_start, 'YYYY-MM-DD') AS week_start,
                total_amount::float8 AS total_amount,
                closed_at
         FROM billing_week_closures
         WHERE week_start = $1`,
        [weekStart]
    );

    return result.rows[0] ?? null;
}

// Bills saved when the week was closed, one row per rider.
async function findWeekSnapshots(client, { weekStart, riderId = null }) {
    const result = await client.query(
        `SELECT rider_id,
                rental_days,
                total_rental::float8 AS total_rental,
                total_km::float8 AS total_km,
                total_energy_charge::float8 AS total_energy_charge,
                total_amount::float8 AS total_amount
         FROM billing_week_snapshots
         WHERE week_start = $1
           AND ($2::varchar IS NULL OR rider_id = $2)
         ORDER BY rider_id`,
        [weekStart, riderId]
    );

    return result.rows;
}

// Returns null if another request closed the week first.
async function insertWeekClosure(client, { weekStart, totalAmount }) {
    const result = await client.query(
        `INSERT INTO billing_week_closures (week_start, total_amount)
         VALUES ($1, $2)
         ON CONFLICT (week_start) DO NOTHING
         RETURNING TO_CHAR(week_start, 'YYYY-MM-DD') AS week_start,
                   total_amount::float8 AS total_amount,
                   closed_at`,
        [weekStart, totalAmount]
    );

    return result.rows[0] ?? null;
}

// Inserts a snapshot of the billing data for a rider for a week. This is called when the week is closed, and the data is saved for future reference.
async function insertWeekSnapshot(client, { weekStart, rider }) {
    await client.query(
        `INSERT INTO billing_week_snapshots
            (week_start, rider_id, rental_days, total_rental,
             total_km, total_energy_charge, total_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
            weekStart,
            rider.riderId,
            rider.rentalDays,
            rider.totalRental,
            rider.totalKm,
            rider.totalEnergyCharge,
            rider.totalAmount
        ]
    );
}

module.exports = {
    findWeekClosure,
    findWeekSnapshots,
    insertWeekClosure,
    insertWeekSnapshot
};
