// One partner ID's earning for one date, locked until the transaction ends.
async function findEarning(client, { partnerId, partnerRiderId, earningDate }) {
    const result = await client.query(
        `SELECT earning_id, amount, status, rider_id
         FROM partner_earnings
         WHERE partner_id = $1 AND partner_rider_id = $2 AND earning_date = $3
         FOR UPDATE`,
        [partnerId, partnerRiderId, earningDate]
    );

    return result.rows[0] ?? null;
}

async function insertEarning(client, { partnerId, partnerRiderId, earningDate, amount, status, riderId, nameInFile, importId }) {
    await client.query(
        `INSERT INTO partner_earnings (
            partner_id,
            partner_rider_id,
            earning_date,
            amount,
            status,
            rider_id,
            name_in_file,
            import_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [partnerId, partnerRiderId, earningDate, amount, status, riderId, nameInFile, importId]
    );
}

// A new amount from a later file. Clears any dismiss reason, since the row is reviewed again.
async function updateEarning(client, { earningId, amount, nameInFile, status, riderId, importId }) {
    await client.query(
        `UPDATE partner_earnings
         SET amount = $2,
             name_in_file = $3,
             status = $4,
             rider_id = $5,
             dismiss_reason = NULL,
             import_id = $6,
             updated_at = now()
         WHERE earning_id = $1`,
        [earningId, amount, nameInFile, status, riderId, importId]
    );
}

// Pending rows grouped by partner + ID, the way they are resolved ($1 = partnerId, $2 = search pattern).
// search matches the ID or a name printed in the sheet; a matching group keeps all its rows.
const PENDING_GROUPS = `
    SELECT pe.partner_id,
           p.name AS partner_name,
           pe.partner_rider_id,
           (array_agg(pe.name_in_file ORDER BY pe.earning_date DESC)
               FILTER (WHERE pe.name_in_file IS NOT NULL))[1] AS name_in_file,
           COUNT(*)::int AS entries,
           SUM(pe.amount) AS total_amount,
           TO_CHAR(MIN(pe.earning_date), 'YYYY-MM-DD') AS first_date,
           TO_CHAR(MAX(pe.earning_date), 'YYYY-MM-DD') AS last_date
    FROM partner_earnings pe
    JOIN partners p ON p.partner_id = pe.partner_id
    WHERE pe.status = 'Pending'
      AND ($1::int IS NULL OR pe.partner_id = $1)
    GROUP BY pe.partner_id, p.name, pe.partner_rider_id
    HAVING $2::text IS NULL
        OR pe.partner_rider_id ILIKE $2
        OR bool_or(pe.name_in_file ILIKE $2)`;

// Oldest first, since old pending earnings hold up payouts the longest.
async function findPendingGroups(client, { partnerId, search, limit, offset }) {
    const result = await client.query(
        `${PENDING_GROUPS}
         ORDER BY MIN(pe.earning_date), p.name, pe.partner_rider_id
         LIMIT $3 OFFSET $4`,
        [partnerId, search, limit, offset]
    );

    return result.rows;
}

async function countPendingGroups(client, { partnerId, search }) {
    const result = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM (${PENDING_GROUPS}) AS pending_groups`,
        [partnerId, search]
    );

    return result.rows[0].total;
}

// Partner IDs with pending earnings dated inside the range, for the dashboard.
async function countPendingIdsInRange(client, { fromDate, toDate }) {
    const result = await client.query(
        `SELECT COUNT(DISTINCT (partner_id, partner_rider_id))::int AS total
         FROM partner_earnings
         WHERE status = 'Pending' AND earning_date BETWEEN $1 AND $2`,
        [fromDate, toDate]
    );

    return result.rows[0].total;
}

// Matched earnings per rider for the week (Monday to Sunday), optionally for one rider.
async function sumMatchedEarningsInWeek(client, { weekStart, riderId = null }) {
    const result = await client.query(
        `SELECT rider_id, SUM(amount)::float8 AS earnings
         FROM partner_earnings
         WHERE status = 'Matched'
           AND earning_date BETWEEN $1::date AND $1::date + 6
           AND ($2::varchar IS NULL OR rider_id = $2)
         GROUP BY rider_id
         ORDER BY rider_id`,
        [weekStart, riderId]
    );

    return result.rows;
}

// Give every pending row of this ID to the rider; returns how many rows changed.
async function matchPendingEarnings(client, { partnerId, partnerRiderId, riderId }) {
    const result = await client.query(
        `UPDATE partner_earnings
         SET status = 'Matched', rider_id = $3, updated_at = now()
         WHERE partner_id = $1 AND partner_rider_id = $2 AND status = 'Pending'`,
        [partnerId, partnerRiderId, riderId]
    );

    return result.rowCount;
}

// Set every pending row of this ID aside with a reason; returns how many rows changed.
async function dismissPendingEarnings(client, { partnerId, partnerRiderId, reason }) {
    const result = await client.query(
        `UPDATE partner_earnings
         SET status = 'Dismissed', dismiss_reason = $3, updated_at = now()
         WHERE partner_id = $1 AND partner_rider_id = $2 AND status = 'Pending'`,
        [partnerId, partnerRiderId, reason]
    );

    return result.rowCount;
}

module.exports = {
    findEarning,
    insertEarning,
    updateEarning,
    findPendingGroups,
    countPendingGroups,
    countPendingIdsInRange,
    sumMatchedEarningsInWeek,
    matchPendingEarnings,
    dismissPendingEarnings
};
