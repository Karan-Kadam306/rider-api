const { pool, inTransaction } = require('../db');
const AppError = require('../errors/AppError');
const hubRepository = require('../repositories/hubRepository');

const FIELD_LIMITS = { name: 100, city: 60, address: 300 };
const MANAGER_NAME_MAX_LENGTH = 100;

function toHub(row) {
    return {
        hubId: row.hub_id,
        code: row.code,
        name: row.name,
        city: row.city,
        address: row.address,
        contactPhone: row.contact_phone,
        managerName: row.manager_name,
        isActive: row.is_active,
        createdAt: row.created_at,
        ...(row.total_bikes !== undefined && {
            totalBikes: row.total_bikes,
            availableBikes: row.available_bikes
        })
    };
}

function parseHubId(hubId, field = 'hubId') {
    if (!/^\d{1,15}$/.test(String(hubId)) || Number(hubId) < 1) {
        throw new AppError(`${field} must be a positive whole number`, 400);
    }

    return Number(hubId);
}

function cleanText(value, field) {
    const clean = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

    if (!clean || clean.length > FIELD_LIMITS[field]) {
        throw new AppError(`${field} is required (at most ${FIELD_LIMITS[field]} characters)`, 400);
    }

    return clean;
}

// Optional; empty clears it. Same 10-digit rule as rider phones.
function cleanContactPhone(value) {
    const clean = String(value ?? '').trim();

    if (clean && !/^[6-9]\d{9}$/.test(clean)) {
        throw new AppError('contactPhone must be a valid 10-digit Indian mobile number', 400);
    }

    return clean || null;
}

// Short code shown in lists, e.g. "PUN-01". Saved in capitals.
function cleanCode(value) {
    const clean = typeof value === 'string' ? value.trim().toUpperCase() : '';

    if (!/^[A-Z0-9-]{2,10}$/.test(clean)) {
        throw new AppError('code must be 2 to 10 letters, digits or dashes', 400);
    }

    return clean;
}

// Optional; empty clears it.
function cleanManagerName(value) {
    const clean = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

    if (clean.length > MANAGER_NAME_MAX_LENGTH) {
        throw new AppError(`managerName must be at most ${MANAGER_NAME_MAX_LENGTH} characters`, 400);
    }

    return clean || null;
}

async function listHubs() {
    const rows = await hubRepository.listHubs(pool);
    return rows.map(toHub);
}

async function createHub({ code, name, city, address, contactPhone, managerName }) {
    const row = await hubRepository.insertHub(pool, {
        code: cleanCode(code),
        name: cleanText(name, 'name'),
        city: cleanText(city, 'city'),
        address: cleanText(address, 'address'),
        contactPhone: cleanContactPhone(contactPhone),
        managerName: cleanManagerName(managerName)
    });

    return toHub(row);
}

// Fields left out keep their value. A hub can only be deactivated once its bikes have moved,
// so no bike is left at a hub nobody can pick.
async function updateHub({ hubId, code, name, city, address, contactPhone, managerName, isActive }) {
    const id = parseHubId(hubId);

    if (isActive !== undefined && typeof isActive !== 'boolean') {
        throw new AppError('isActive must be true or false', 400);
    }

    const changes = {
        code: code === undefined ? undefined : cleanCode(code),
        name: name === undefined ? undefined : cleanText(name, 'name'),
        city: city === undefined ? undefined : cleanText(city, 'city'),
        address: address === undefined ? undefined : cleanText(address, 'address'),
        contactPhone: contactPhone === undefined ? undefined : cleanContactPhone(contactPhone),
        managerName: managerName === undefined ? undefined : cleanManagerName(managerName)
    };

    return inTransaction(async client => {
        const hub = await hubRepository.findById(client, { hubId: id, lock: 'update' });

        if (!hub) {
            throw new AppError('Hub not found', 404);
        }

        if (hub.is_active && isActive === false && await hubRepository.countBikes(client, { hubId: id }) > 0) {
            throw new AppError('Move this hub\'s bikes to another hub before deactivating it', 409);
        }

        const updated = await hubRepository.updateHub(client, {
            hubId: id,
            code: changes.code ?? hub.code,
            name: changes.name ?? hub.name,
            city: changes.city ?? hub.city,
            address: changes.address ?? hub.address,
            contactPhone: changes.contactPhone === undefined ? hub.contact_phone : changes.contactPhone,
            managerName: changes.managerName === undefined ? hub.manager_name : changes.managerName,
            isActive: isActive ?? hub.is_active
        });

        return toHub(updated);
    });
}

// For adding or moving a bike inside the caller's transaction. The share lock stops the hub
// being deactivated until that transaction ends.
async function lockActiveHub(client, hubId) {
    const hub = await hubRepository.findById(client, { hubId: parseHubId(hubId), lock: 'share' });

    if (!hub) {
        throw new AppError('Hub not found', 400);
    }

    if (!hub.is_active) {
        throw new AppError('This hub is inactive', 400);
    }

    return hub;
}

module.exports = {
    parseHubId,
    listHubs,
    createHub,
    updateHub,
    lockActiveHub
};
