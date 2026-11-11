// A rider's active partner IDs as a JSON list, and when the latest one was added.
// Used with LEFT JOIN LATERAL, so riders without mappings get mappings = null.
const ACTIVE_MAPPINGS = `
    SELECT json_agg(
               json_build_object(
                   'mappingId', rm.mapping_id::int,
                   'partnerId', rm.partner_id,
                   'partnerName', p.name,
                   'partnerRiderId', rm.partner_rider_id,
                   'mappedAt', rm.created_at
               )
               ORDER BY p.name
           ) AS mappings,
           max(rm.created_at) AS last_mapped_at
    FROM rider_partner_mappings rm
    JOIN partners p ON p.partner_id = rm.partner_id
    WHERE rm.rider_id = r.rider_id AND rm.is_active`;

// Status and search filters shared by the list and its counts ($1 = status, $2 = search pattern).
// search matches the rider's name, phone or ID, or one of their active partner IDs.
const RIDER_FILTERS = `
    ($1::text IS NULL OR r.status = $1)
    AND (
        $2::text IS NULL
        OR r.name ILIKE $2
        OR r.phone ILIKE $2
        OR r.rider_id ILIKE $2
        OR EXISTS (
            SELECT 1
            FROM rider_partner_mappings sm
            WHERE sm.rider_id = r.rider_id AND sm.is_active AND sm.partner_rider_id ILIKE $2
        )
    )`;

async function findPartners(client) {
    const result = await client.query(
        `SELECT partner_id, code, name
         FROM partners
         ORDER BY name`
    );

    return result.rows;
}

// One page of riders with or without active mappings.
// Riders still to be mapped show the newest first; mapped riders show the latest mapped first.
async function findRidersWithMappings(client, { mapped, status, search, limit, offset }) {
    const result = await client.query(
        `SELECT r.rider_id, r.name, r.phone, r.status, m.mappings, m.last_mapped_at
         FROM riders r
         LEFT JOIN LATERAL (${ACTIVE_MAPPINGS}) m ON true
         WHERE ${RIDER_FILTERS}
           AND (m.mappings IS NOT NULL) = $3
         ORDER BY ${mapped ? 'm.last_mapped_at DESC' : 'r.created_at DESC'}, r.rider_id
         LIMIT $4 OFFSET $5`,
        [status, search ? `%${search}%` : null, mapped, limit, offset]
    );

    return result.rows;
}

async function countRidersByMapping(client, { status, search }) {
    const result = await client.query(
        `SELECT count(*) FILTER (WHERE NOT has_mappings)::int AS unmapped,
                count(*) FILTER (WHERE has_mappings)::int AS mapped
         FROM (
             SELECT EXISTS (
                        SELECT 1
                        FROM rider_partner_mappings rm
                        WHERE rm.rider_id = r.rider_id AND rm.is_active
                    ) AS has_mappings
             FROM riders r
             WHERE ${RIDER_FILTERS}
         ) riders_found`,
        [status, search ? `%${search}%` : null]
    );

    return result.rows[0];
}

async function findRiderWithMappings(client, { riderId }) {
    const result = await client.query(
        `SELECT r.rider_id, r.name, r.phone, r.status, m.mappings, m.last_mapped_at
         FROM riders r
         LEFT JOIN LATERAL (${ACTIVE_MAPPINGS}) m ON true
         WHERE r.rider_id = $1`,
        [riderId]
    );

    return result.rows[0] ?? null;
}

// Locks the rider until the transaction ends, so two saves for the same rider run one after the other.
async function lockRider(client, { riderId }) {
    const result = await client.query(
        `SELECT rider_id, name, status
         FROM riders
         WHERE rider_id = $1
         FOR UPDATE`,
        [riderId]
    );

    return result.rows[0] ?? null;
}

async function findActiveMappingsByRider(client, { riderId }) {
    const result = await client.query(
        `SELECT mapping_id::int AS mapping_id, partner_id, partner_rider_id
         FROM rider_partner_mappings
         WHERE rider_id = $1 AND is_active`,
        [riderId]
    );

    return result.rows;
}

// The first of the given partner IDs that is already active for a different rider, or null.
async function findIdTakenByOtherRider(client, { riderId, partnerIds, partnerRiderIds }) {
    const result = await client.query(
        `SELECT rm.partner_rider_id, rm.rider_id, r.name AS rider_name, p.name AS partner_name
         FROM rider_partner_mappings rm
         JOIN riders r ON r.rider_id = rm.rider_id
         JOIN partners p ON p.partner_id = rm.partner_id
         WHERE rm.is_active
           AND rm.rider_id <> $1
           AND (rm.partner_id, rm.partner_rider_id) IN (
               SELECT * FROM unnest($2::int[], $3::text[])
           )
         ORDER BY p.name
         LIMIT 1`,
        [riderId, partnerIds, partnerRiderIds]
    );

    return result.rows[0] ?? null;
}

// Old mappings are kept for history, marked inactive.
async function deactivateMappings(client, { mappingIds, deactivatedBy }) {
    await client.query(
        `UPDATE rider_partner_mappings
         SET is_active = false, deactivated_at = now(), deactivated_by = $2
         WHERE mapping_id = ANY($1::bigint[])`,
        [mappingIds, deactivatedBy]
    );
}

async function insertMapping(client, { riderId, partnerId, partnerRiderId, createdBy }) {
    await client.query(
        `INSERT INTO rider_partner_mappings (rider_id, partner_id, partner_rider_id, created_by)
         VALUES ($1, $2, $3, $4)`,
        [riderId, partnerId, partnerRiderId, createdBy]
    );
}

async function findPartnerById(client, { partnerId }) {
    const result = await client.query(
        `SELECT partner_id, code, name
         FROM partners
         WHERE partner_id = $1`,
        [partnerId]
    );

    return result.rows[0] ?? null;
}

// Held by an earnings import until it commits, so one partner's files are imported one at a time.
// NO KEY UPDATE, not UPDATE: the import's own batch row already holds a key-share lock on the partner,
// and FOR UPDATE would deadlock with another import holding the same.
async function lockPartner(client, { partnerId }) {
    await client.query(
        `SELECT partner_id
         FROM partners
         WHERE partner_id = $1
         FOR NO KEY UPDATE`,
        [partnerId]
    );
}

// Taken before a rider lock when mappings change, so an earnings import of these partners
// either finishes first or starts after, and never saves a mapped ID as Pending.
// Shared, so mapping saves do not wait on each other. Returns the partners found.
async function lockPartnersShared(client, { partnerIds }) {
    const result = await client.query(
        `SELECT partner_id, code, name
         FROM partners
         WHERE partner_id = ANY($1::int[])
         ORDER BY partner_id
         FOR SHARE`,
        [partnerIds]
    );

    return result.rows;
}

// The rider each of these partner IDs is mapped to now; unmapped IDs are left out.
async function findActiveRidersByPartnerRiderIds(client, { partnerId, partnerRiderIds }) {
    const result = await client.query(
        `SELECT partner_rider_id, rider_id
         FROM rider_partner_mappings
         WHERE partner_id = $1 AND partner_rider_id = ANY($2::text[]) AND is_active`,
        [partnerId, partnerRiderIds]
    );

    return result.rows;
}

module.exports = {
    findPartners,
    findPartnerById,
    lockPartner,
    lockPartnersShared,
    findActiveRidersByPartnerRiderIds,
    findRidersWithMappings,
    countRidersByMapping,
    findRiderWithMappings,
    lockRider,
    findActiveMappingsByRider,
    findIdTakenByOtherRider,
    deactivateMappings,
    insertMapping
};
