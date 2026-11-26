const HUB_COLUMNS = `h.hub_id::int AS hub_id,
                h.code,
                h.name,
                h.city,
                h.address,
                h.contact_phone,
                h.manager_name,
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

async function insertHub(client, { code, name, city, address, contactPhone, managerName }) {
    const result = await client.query(
        `INSERT INTO hubs AS h (code, name, city, address, contact_phone, manager_name)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${HUB_COLUMNS}`,
        [code, name, city, address, contactPhone, managerName]
    );

    return result.rows[0];
}

async function updateHub(client, { hubId, code, name, city, address, contactPhone, managerName, isActive }) {
    const result = await client.query(
        `UPDATE hubs AS h
         SET code = $2, name = $3, city = $4, address = $5, contact_phone = $6, manager_name = $7, is_active = $8
         WHERE h.hub_id = $1
         RETURNING ${HUB_COLUMNS}`,
        [hubId, code, name, city, address, contactPhone, managerName, isActive]
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
