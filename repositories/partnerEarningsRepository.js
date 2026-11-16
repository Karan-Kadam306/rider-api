const { mappingCoversDate } = require('./partnerRepository');

// The saved earnings for these partner ID + date entries, locked until the transaction ends.
async function findEarningsForUpdate(client, { partnerId, entries }) {
    const result = await client.query(
        `SELECT pe.earning_id,
                pe.partner_rider_id,
                TO_CHAR(pe.earning_date, 'YYYY-MM-DD') AS earning_date,
                pe.amount,
                pe.status,
                pe.rider_id
         FROM partner_earnings pe
         JOIN UNNEST($2::text[], $3::date[]) AS e(partner_rider_id, earning_date)
           ON pe.partner_rider_id = e.partner_rider_id AND pe.earning_date = e.earning_date
         WHERE pe.partner_id = $1
         FOR UPDATE OF pe`,
        [partnerId, entries.map(entry => entry.partnerRiderId), entries.map(entry => entry.earningDate)]
    );

    return result.rows;
}

// Save new earnings of one partner file in one statement.
async function insertEarnings(client, { partnerId, importId, rows }) {
    if (rows.length === 0) {
        return;
    }

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
         SELECT $1, e.partner_rider_id, e.earning_date, e.amount, e.status, e.rider_id, e.name_in_file, $2
         FROM UNNEST($3::text[], $4::date[], $5::numeric[], $6::text[], $7::varchar[], $8::text[])
             AS e(partner_rider_id, earning_date, amount, status, rider_id, name_in_file)`,
        [
            partnerId,
            importId,
            rows.map(row => row.partnerRiderId),
            rows.map(row => row.earningDate),
            rows.map(row => row.amount),
            rows.map(row => row.status),
            rows.map(row => row.riderId),
            rows.map(row => row.nameInFile)
        ]
    );
}

// New amounts from a later file, in one statement. Clears any dismiss reason, since the row is reviewed again.
// The reviewer stays only while the status does (pe.status is the old value).
async function updateEarnings(client, { importId, rows }) {
    if (rows.length === 0) {
        return;
    }

    await client.query(
        `UPDATE partner_earnings pe
         SET amount = u.amount,
             name_in_file = u.name_in_file,
             status = u.status,
             rider_id = u.rider_id,
             dismiss_reason = NULL,
             reviewed_by = CASE WHEN pe.status = u.status THEN pe.reviewed_by END,
             reviewed_at = CASE WHEN pe.status = u.status THEN pe.reviewed_at END,
             import_id = $1,
             updated_at = now()
         FROM UNNEST($2::bigint[], $3::numeric[], $4::text[], $5::text[], $6::varchar[])
             AS u(earning_id, amount, name_in_file, status, rider_id)
         WHERE pe.earning_id = u.earning_id`,
        [
            importId,
            rows.map(row => row.earningId),
            rows.map(row => row.amount),
            rows.map(row => row.nameInFile),
            rows.map(row => row.status),
            rows.map(row => row.riderId)
        ]
    );
}

// The dates of one partner ID's rows in a status, optionally dated fromDate..toDate and not held by notRiderId:
// the rows a review action is about to change, so their weeks can be locked first.
async function findEarningDates(client, { partnerId, partnerRiderId, status, fromDate = null, toDate = null, notRiderId = null }) {
    const result = await client.query(
        `SELECT DISTINCT TO_CHAR(earning_date, 'YYYY-MM-DD') AS earning_date
         FROM partner_earnings
         WHERE partner_id = $1 AND partner_rider_id = $2 AND status = $3
           AND ($4::date IS NULL OR earning_date >= $4)
           AND ($5::date IS NULL OR earning_date <= $5)
           AND ($6::varchar IS NULL OR rider_id <> $6)`,
        [partnerId, partnerRiderId, status, fromDate, toDate, notRiderId]
    );

    return result.rows.map(row => row.earning_date);
}

// A later file saved these partner ID + date rows, so their open row errors are fixed.
async function resolveRowErrors(client, { partnerId, entries, importId, resolvedBy }) {
    await client.query(
        `UPDATE import_row_errors re
         SET resolved_at = now(), resolved_by = $2, resolve_note = 'Replaced by import #' || $3
         FROM UNNEST($4::text[], $5::date[]) AS e(partner_rider_id, earning_date)
         WHERE re.partner_id = $1
           AND re.resolved_at IS NULL
           AND re.partner_rider_id = e.partner_rider_id
           AND re.earning_date = e.earning_date`,
        [
            partnerId,
            resolvedBy,
            importId,
            entries.map(entry => entry.partnerRiderId),
            entries.map(entry => entry.earningDate)
        ]
    );
}

// Open earnings row errors that block the week's payout: those dated in the week,
// and those with no readable date, which could belong to any week.
async function countOpenRowErrorsForWeek(client, { weekStart }) {
    const result = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM import_row_errors
         WHERE partner_id IS NOT NULL
           AND resolved_at IS NULL
           AND (earning_date IS NULL OR earning_date BETWEEN $1::date AND $1::date + 6)`,
        [weekStart]
    );

    return result.rows[0].total;
}

// Open earnings row errors, oldest date first; undated ones come first since they block every week.
async function findOpenRowErrors(client, { partnerId, limit, offset }) {
    const result = await client.query(
        `SELECT re.error_id::int AS error_id,
                re.import_id::int AS import_id,
                b.file_name,
                b.created_at AS uploaded_at,
                re.partner_id,
                p.name AS partner_name,
                re.row_number,
                re.row_data,
                re.error_message,
                re.partner_rider_id,
                TO_CHAR(re.earning_date, 'YYYY-MM-DD') AS earning_date
         FROM import_row_errors re
         JOIN import_batches b ON b.import_id = re.import_id
         JOIN partners p ON p.partner_id = re.partner_id
         WHERE re.resolved_at IS NULL
           AND ($1::int IS NULL OR re.partner_id = $1)
         ORDER BY re.earning_date NULLS FIRST, re.import_id, re.row_number
         LIMIT $2 OFFSET $3`,
        [partnerId, limit, offset]
    );

    return result.rows;
}

async function countOpenRowErrors(client, { partnerId }) {
    const result = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM import_row_errors
         WHERE partner_id IS NOT NULL
           AND resolved_at IS NULL
           AND ($1::int IS NULL OR partner_id = $1)`,
        [partnerId]
    );

    return result.rows[0].total;
}

// Set one open earnings row error aside with a note; returns the row, or null if there was none.
async function dismissRowError(client, { errorId, note, resolvedBy }) {
    const result = await client.query(
        `UPDATE import_row_errors
         SET resolved_at = now(), resolved_by = $3, resolve_note = $2
         WHERE error_id = $1 AND partner_id IS NOT NULL AND resolved_at IS NULL
         RETURNING error_id::int AS error_id, row_number, partner_rider_id`,
        [errorId, note, resolvedBy]
    );

    return result.rows[0] ?? null;
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

// Give pending rows of this ID to the rider; returns how many rows changed.
// onlyCoveredDates: only rows dated inside one of the rider's mappings of the ID (a mapping save).
// Without it every pending row moves, for a reviewer who chose the rider for these rows (a resolve).
async function matchPendingEarnings(client, { partnerId, partnerRiderId, riderId, reviewedBy, onlyCoveredDates = false }) {
    const result = await client.query(
        `UPDATE partner_earnings pe
         SET status = 'Matched', rider_id = $3, reviewed_by = $4, reviewed_at = now(), updated_at = now()
         WHERE pe.partner_id = $1 AND pe.partner_rider_id = $2 AND pe.status = 'Pending'
           AND (
               NOT $5::boolean
               OR EXISTS (
                   SELECT 1
                   FROM rider_partner_mappings rm
                   WHERE rm.partner_id = pe.partner_id
                     AND rm.partner_rider_id = pe.partner_rider_id
                     AND rm.rider_id = $3
                     AND ${mappingCoversDate('rm', 'pe.earning_date')}
               )
           )`,
        [partnerId, partnerRiderId, riderId, reviewedBy, onlyCoveredDates]
    );

    return result.rowCount;
}

// Set every pending row of this ID aside with a reason; returns how many rows changed.
async function dismissPendingEarnings(client, { partnerId, partnerRiderId, reason, reviewedBy }) {
    const result = await client.query(
        `UPDATE partner_earnings
         SET status = 'Dismissed', dismiss_reason = $3, reviewed_by = $4, reviewed_at = now(), updated_at = now()
         WHERE partner_id = $1 AND partner_rider_id = $2 AND status = 'Pending'`,
        [partnerId, partnerRiderId, reason, reviewedBy]
    );

    return result.rowCount;
}

// Partners (of partnerCodes, the ones with a file format) whose sheet for the week has not been imported:
// a rider who held a bike that week was mapped to them during the week, but they have no earnings dated in it.
// A ₹0 row counts as imported.
async function findPartnersWithoutEarnings(client, { weekStart, partnerCodes }) {
    const result = await client.query(
        `SELECT DISTINCT p.name
         FROM rider_partner_mappings m
         JOIN partners p ON p.partner_id = m.partner_id
         WHERE p.code = ANY($2::text[])
           AND m.created_at < $1::date + 7
           AND (m.deactivated_at IS NULL OR m.deactivated_at >= $1::date)
           AND EXISTS (
               SELECT 1 FROM bike_assignments ba
               WHERE ba.rider_id = m.rider_id
                 AND ba.assigned_at < $1::date + 7
                 AND (ba.returned_at IS NULL OR ba.returned_at > $1::date)
           )
           AND NOT EXISTS (
               SELECT 1 FROM partner_earnings pe
               WHERE pe.partner_id = m.partner_id
                 AND pe.earning_date BETWEEN $1::date AND $1::date + 6
           )
         ORDER BY p.name`,
        [weekStart, partnerCodes]
    );

    return result.rows.map(row => row.name);
}

// Matched rows of one partner ID held by riders other than $3, dated $4..$5, totalled per rider.
async function findMatchedWithOtherRiders(client, { partnerId, partnerRiderId, riderId, fromDate, toDate }) {
    const result = await client.query(
        `SELECT pe.rider_id, r.name AS rider_name, COUNT(*)::int AS entries, SUM(pe.amount)::float8 AS total_amount
         FROM partner_earnings pe
         JOIN riders r ON r.rider_id = pe.rider_id
         WHERE pe.partner_id = $1 AND pe.partner_rider_id = $2 AND pe.status = 'Matched'
           AND pe.rider_id <> $3
           AND pe.earning_date BETWEEN $4 AND $5
         GROUP BY pe.rider_id, r.name
         ORDER BY pe.rider_id`,
        [partnerId, partnerRiderId, riderId, fromDate, toDate]
    );

    return result.rows;
}

// Give those rows to rider $3; returns how many rows moved.
async function moveMatchedEarnings(client, { partnerId, partnerRiderId, riderId, fromDate, toDate, reviewedBy }) {
    const result = await client.query(
        `UPDATE partner_earnings
         SET rider_id = $3, reviewed_by = $6, reviewed_at = now(), updated_at = now()
         WHERE partner_id = $1 AND partner_rider_id = $2 AND status = 'Matched'
           AND rider_id <> $3
           AND earning_date BETWEEN $4 AND $5`,
        [partnerId, partnerRiderId, riderId, fromDate, toDate, reviewedBy]
    );

    return result.rowCount;
}

module.exports = {
    findEarningsForUpdate,
    findEarningDates,
    findPartnersWithoutEarnings,
    findMatchedWithOtherRiders,
    moveMatchedEarnings,
    insertEarnings,
    updateEarnings,
    resolveRowErrors,
    countOpenRowErrorsForWeek,
    findOpenRowErrors,
    countOpenRowErrors,
    dismissRowError,
    findPendingGroups,
    countPendingGroups,
    countPendingIdsInRange,
    sumMatchedEarningsInWeek,
    matchPendingEarnings,
    dismissPendingEarnings
};
