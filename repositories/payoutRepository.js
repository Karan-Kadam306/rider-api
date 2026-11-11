const RUN_COLUMNS = `run_id::int AS run_id,
                TO_CHAR(week_start, 'YYYY-MM-DD') AS week_start,
                run_number,
                rider_count,
                updated_count,
                total_amount::float8 AS total_amount,
                total_earnings::float8 AS total_earnings,
                total_net_payout::float8 AS total_net_payout,
                triggered_at`;

// Every payout run of a week, oldest first.
async function findRuns(client, { weekStart }) {
    const result = await client.query(
        `SELECT ${RUN_COLUMNS}
         FROM payout_runs
         WHERE week_start = $1
         ORDER BY run_number`,
        [weekStart]
    );

    return result.rows;
}

// The latest payout runs across all weeks.
async function findRecentRuns(client, { limit }) {
    const result = await client.query(
        `SELECT ${RUN_COLUMNS}
         FROM payout_runs
         ORDER BY triggered_at DESC, run_id DESC
         LIMIT $1`,
        [limit]
    );

    return result.rows;
}

// Current payout per rider for a week.
async function findItems(client, { weekStart }) {
    const result = await client.query(
        `SELECT rider_id,
                rental_days,
                total_rental::float8 AS total_rental,
                total_km::float8 AS total_km,
                total_energy_charge::float8 AS total_energy_charge,
                total_amount::float8 AS total_amount,
                total_earnings::float8 AS total_earnings,
                net_payout::float8 AS net_payout,
                previous_total_amount::float8 AS previous_total_amount,
                updated_at,
                (SELECT run_number FROM payout_runs WHERE run_id = payout_items.updated_run_id) AS updated_run_number
         FROM payout_items
         WHERE week_start = $1
         ORDER BY rider_id`,
        [weekStart]
    );

    return result.rows;
}

// Only one payout run per week at a time; held until the transaction ends.
async function lockWeek(client, { weekStart }) {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('payout:' || $1::text))`, [weekStart]);
}

async function insertRun(client, { weekStart, runNumber, riderCount, updatedCount, totalAmount, totalEarnings, totalNetPayout }) {
    const result = await client.query(
        `INSERT INTO payout_runs
            (week_start, run_number, rider_count, updated_count, total_amount, total_earnings, total_net_payout)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${RUN_COLUMNS}`,
        [weekStart, runNumber, riderCount, updatedCount, totalAmount, totalEarnings, totalNetPayout]
    );

    return result.rows[0];
}

// Save a rider's new payout; an existing one keeps its old total as previous_total_amount.
async function upsertItem(client, { weekStart, riderId, amounts, runId }) {
    await client.query(
        `INSERT INTO payout_items
            (week_start, rider_id, rental_days, total_rental, total_km,
             total_energy_charge, total_amount, total_earnings, net_payout,
             first_run_id, updated_run_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
         ON CONFLICT (week_start, rider_id) DO UPDATE SET
            rental_days = EXCLUDED.rental_days,
            total_rental = EXCLUDED.total_rental,
            total_km = EXCLUDED.total_km,
            total_energy_charge = EXCLUDED.total_energy_charge,
            total_amount = EXCLUDED.total_amount,
            total_earnings = EXCLUDED.total_earnings,
            net_payout = EXCLUDED.net_payout,
            previous_total_amount = payout_items.total_amount,
            updated_run_id = EXCLUDED.updated_run_id,
            updated_at = now()`,
        [
            weekStart,
            riderId,
            amounts.rentalDays,
            amounts.totalRental,
            amounts.totalKm,
            amounts.totalEnergyCharge,
            amounts.totalAmount,
            amounts.earnings,
            amounts.netPayout,
            runId
        ]
    );
}

module.exports = {
    findRuns,
    findRecentRuns,
    findItems,
    lockWeek,
    insertRun,
    upsertItem
};
