const HUB_COLUMNS = `h.hub_id::int AS hub_id,
                h.name,
                h.city,
                h.address,
                h.contact_phone,
                h.is_active,
                h.created_at`;

const LOCK_CLAUSES = { update: 'FOR UPDATE', share: 'FOR SHARE' };

// Every hub with its bike counts, active hubs first. There are only a few hubs, so no paging.
async function listHubs(client) {
    const result = await client.query(
        `SELECT ${HUB_COLUMNS},
                count(b.bike_id)::int AS total_bikes,
                (count(b.bike_id) FILTER (WHERE b.status = 'Available'))::int AS available_bikes
         FROM hubs h
         LEFT JOIN bikes b ON b.hub_id = h.hub_id
         GROUP BY h.hub_id
         ORDER BY h.is_active DESC, lower(h.name)`
    );

    return result.rows;
}

// lock: 'update' while the hub itself changes, 'share' while a bike is added to or moved into it.
async function findById(client, { hubId, lock = null }) {
    const result = await client.query(
        `SELECT ${HUB_COLUMNS}
         FROM hubs h
         WHERE h.hub_id = $1
         ${lock ? LOCK_CLAUSES[lock] : ''}`,
        [hubId]
    );

    return result.rows[0] ?? null;
}

async function insertHub(client, { name, city, address, contactPhone }) {
    const result = await client.query(
        `INSERT INTO hubs AS h (name, city, address, contact_phone)
         VALUES ($1, $2, $3, $4)
         RETURNING ${HUB_COLUMNS}`,
        [name, city, address, contactPhone]
    );

    return result.rows[0];
}

async function updateHub(client, { hubId, name, city, address, contactPhone, isActive }) {
    const result = await client.query(
        `UPDATE hubs AS h
         SET name = $2, city = $3, address = $4, contact_phone = $5, is_active = $6
         WHERE h.hub_id = $1
         RETURNING ${HUB_COLUMNS}`,
        [hubId, name, city, address, contactPhone, isActive]
    );

    return result.rows[0];
}

async function countBikes(client, { hubId }) {
    const result = await client.query(
        `SELECT count(*)::int AS total FROM bikes WHERE hub_id = $1`,
        [hubId]
    );

    return result.rows[0].total;
}

module.exports = {
    listHubs,
    findById,
    insertHub,
    updateHub,
    countBikes
};
