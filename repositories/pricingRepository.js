// Postpaid rates, deposit amounts and prepaid packs. All three tables are small, so lists are not paged.

const RATE_COLUMNS = `r.rate_id::int AS rate_id,
                r.rental_per_day::float8 AS rental_per_day,
                r.energy_per_km::float8 AS energy_per_km,
                TO_CHAR(r.effective_from, 'YYYY-MM-DD') AS effective_from,
                r.created_at,
                u.name AS created_by_name`;

const DEPOSIT_COLUMNS = `d.deposit_id::int AS deposit_id,
                d.amount::float8 AS amount,
                TO_CHAR(d.effective_from, 'YYYY-MM-DD') AS effective_from,
                d.created_at,
                u.name AS created_by_name`;

const PACK_COLUMNS = `p.pack_id::int AS pack_id,
                p.kind,
                p.name,
                p.price::float8 AS price,
                p.km_included,
                p.validity_days,
                p.is_active,
                p.created_at`;

// Oldest first, the order utils/rateOn.js expects.
async function findPostpaidRates(client) {
    const result = await client.query(
        `SELECT ${RATE_COLUMNS}
         FROM postpaid_rates r
         LEFT JOIN users u ON u.user_id = r.created_by
         ORDER BY r.effective_from`
    );

    return result.rows;
}

async function insertPostpaidRate(client, { rentalPerDay, energyPerKm, effectiveFrom, createdBy }) {
    const result = await client.query(
        `INSERT INTO postpaid_rates (rental_per_day, energy_per_km, effective_from, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING rate_id::int AS rate_id`,
        [rentalPerDay, energyPerKm, effectiveFrom, createdBy]
    );

    return result.rows[0].rate_id;
}

async function findPostpaidRateById(client, { rateId }) {
    const result = await client.query(
        `SELECT ${RATE_COLUMNS}
         FROM postpaid_rates r
         LEFT JOIN users u ON u.user_id = r.created_by
         WHERE r.rate_id = $1`,
        [rateId]
    );

    return result.rows[0] ?? null;
}

async function deletePostpaidRate(client, { rateId }) {
    await client.query('DELETE FROM postpaid_rates WHERE rate_id = $1', [rateId]);
}

// Oldest first.
async function findDepositAmounts(client) {
    const result = await client.query(
        `SELECT ${DEPOSIT_COLUMNS}
         FROM deposit_amounts d
         LEFT JOIN users u ON u.user_id = d.created_by
         ORDER BY d.effective_from`
    );

    return result.rows;
}

async function insertDepositAmount(client, { amount, effectiveFrom, createdBy }) {
    const result = await client.query(
        `INSERT INTO deposit_amounts (amount, effective_from, created_by)
         VALUES ($1, $2, $3)
         RETURNING deposit_id::int AS deposit_id`,
        [amount, effectiveFrom, createdBy]
    );

    return result.rows[0].deposit_id;
}

async function findDepositAmountById(client, { depositId }) {
    const result = await client.query(
        `SELECT ${DEPOSIT_COLUMNS}
         FROM deposit_amounts d
         LEFT JOIN users u ON u.user_id = d.created_by
         WHERE d.deposit_id = $1`,
        [depositId]
    );

    return result.rows[0] ?? null;
}

async function deleteDepositAmount(client, { depositId }) {
    await client.query('DELETE FROM deposit_amounts WHERE deposit_id = $1', [depositId]);
}

// Weekly packs first, then top-ups; cheapest first within each.
async function findPrepaidPacks(client) {
    const result = await client.query(
        `SELECT ${PACK_COLUMNS}
         FROM prepaid_packs p
         ORDER BY p.kind DESC, p.price, p.pack_id`
    );

    return result.rows;
}

async function findPrepaidPackById(client, { packId, forUpdate = false }) {
    const result = await client.query(
        `SELECT ${PACK_COLUMNS}
         FROM prepaid_packs p
         WHERE p.pack_id = $1
         ${forUpdate ? 'FOR UPDATE' : ''}`,
        [packId]
    );

    return result.rows[0] ?? null;
}

async function insertPrepaidPack(client, { kind, name, price, kmIncluded, validityDays, createdBy }) {
    const result = await client.query(
        `INSERT INTO prepaid_packs AS p (kind, name, price, km_included, validity_days, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${PACK_COLUMNS}`,
        [kind, name, price, kmIncluded, validityDays, createdBy]
    );

    return result.rows[0];
}

async function updatePrepaidPack(client, { packId, name, price, kmIncluded, validityDays, isActive }) {
    const result = await client.query(
        `UPDATE prepaid_packs AS p
         SET name = $2, price = $3, km_included = $4, validity_days = $5, is_active = $6
         WHERE p.pack_id = $1
         RETURNING ${PACK_COLUMNS}`,
        [packId, name, price, kmIncluded, validityDays, isActive]
    );

    return result.rows[0];
}

// Today (IST, the pool's timezone) and the first day after the last week that was closed or paid out.
// Bills up to that week must not change; first_open_date is null when no week was settled.
async function findPricingDates(client) {
    const result = await client.query(
        `SELECT TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') AS today,
                TO_CHAR(GREATEST(
                    (SELECT max(week_start) FROM billing_week_closures),
                    (SELECT max(week_start) FROM payout_runs)
                ) + 7, 'YYYY-MM-DD') AS first_open_date`
    );

    return result.rows[0];
}

module.exports = {
    findPostpaidRates,
    insertPostpaidRate,
    findPostpaidRateById,
    deletePostpaidRate,
    findDepositAmounts,
    insertDepositAmount,
    findDepositAmountById,
    deleteDepositAmount,
    findPrepaidPacks,
    findPrepaidPackById,
    insertPrepaidPack,
    updatePrepaidPack,
    findPricingDates
};
