const { pool } = require('../db');
const AppError = require('../errors/AppError');
const partnerRepository = require('../repositories/partnerRepository');
const { inTransaction } = require('./userService');

const VIEWS = ['unmapped', 'mapped'];
const RIDER_STATUSES = ['Active', 'Inactive', 'Terminated'];
const MAX_PARTNER_RIDER_ID_LENGTH = 100;

function isPositiveInteger(value) {
    return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

// Partner sheets are not consistent about case or spaces, so IDs are stored trimmed and uppercase.
function normalizePartnerRiderId(value) {
    return String(value).trim().toUpperCase();
}

function toPartner(row) {
    return {
        partnerId: row.partner_id,
        code: row.code,
        name: row.name
    };
}

function toRider(row) {
    return {
        riderId: row.rider_id,
        name: row.name,
        phone: row.phone,
        status: row.status,
        lastMappedAt: row.last_mapped_at,
        mappings: row.mappings ?? []
    };
}

async function getPartners() {
    const rows = await partnerRepository.findPartners(pool);
    return rows.map(toPartner);
}

// One page of riders for the Without Mappings or Mapped tab, with the count for each tab.
async function listRiderMappings({ view = 'unmapped', status, search, page = 1, limit = 20 }) {
    if (!VIEWS.includes(view)) {
        throw new AppError(`view must be one of: ${VIEWS.join(', ')}`, 400);
    }

    if (status !== undefined && !RIDER_STATUSES.includes(status)) {
        throw new AppError(`status must be one of: ${RIDER_STATUSES.join(', ')}`, 400);
    }

    if (!isPositiveInteger(page) || !isPositiveInteger(limit) || Number(limit) > 100) {
        throw new AppError(
            'Page must be a positive integer and limit must be between 1 and 100',
            400
        );
    }

    page = Number(page);
    limit = Number(limit);

    const offset = (page - 1) * limit;
    const filters = {
        status: status ?? null,
        search: String(search ?? '').trim().slice(0, 100) || null
    };

    const [counts, rows] = await Promise.all([
        partnerRepository.countRidersByMapping(pool, filters),
        partnerRepository.findRidersWithMappings(pool, {
            ...filters,
            mapped: view === 'mapped',
            limit,
            offset
        })
    ]);

    const totalRecords = counts[view];

    return {
        counts,
        pagination: {
            page,
            limit,
            offset,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limit)
        },
        count: rows.length,
        riders: rows.map(toRider)
    };
}

// Check the requested mappings and return them cleaned: [{ partnerId, partnerRiderId }].
function cleanMappings(mappings, partnerById) {
    if (!Array.isArray(mappings)) {
        throw new AppError('mappings must be a list of { partnerId, partnerRiderId }', 400);
    }

    const seenPartners = new Set();

    return mappings.map(mapping => {
        const partner = partnerById.get(Number(mapping?.partnerId));

        if (!isPositiveInteger(mapping?.partnerId) || !partner) {
            throw new AppError('Each mapping needs a valid partnerId', 400);
        }

        if (seenPartners.has(partner.partner_id)) {
            throw new AppError(`${partner.name} appears more than once`, 400);
        }

        seenPartners.add(partner.partner_id);

        const partnerRiderId = typeof mapping.partnerRiderId === 'string'
            ? normalizePartnerRiderId(mapping.partnerRiderId)
            : '';

        if (!partnerRiderId) {
            throw new AppError(`Enter the ${partner.name} rider ID`, 400);
        }

        if (partnerRiderId.length > MAX_PARTNER_RIDER_ID_LENGTH) {
            throw new AppError(
                `${partner.name} rider ID must be at most ${MAX_PARTNER_RIDER_ID_LENGTH} characters`,
                400
            );
        }

        return { partnerId: partner.partner_id, partnerRiderId };
    });
}

// Replace a rider's partner IDs with the given list. A partner left out is unmapped;
// a changed ID ends the old mapping and starts a new one. Unchanged mappings are kept as they are.
async function saveRiderMappings({ riderId, mappings }) {
    const partners = await partnerRepository.findPartners(pool);
    const wanted = cleanMappings(mappings, new Map(partners.map(partner => [partner.partner_id, partner])));

    return inTransaction(async client => {
        const rider = await partnerRepository.lockRider(client, { riderId });

        if (!rider) {
            throw new AppError(`Rider not found: ${riderId}`, 404);
        }

        if (wanted.length > 0) {
            const taken = await partnerRepository.findIdTakenByOtherRider(client, {
                riderId,
                partnerIds: wanted.map(mapping => mapping.partnerId),
                partnerRiderIds: wanted.map(mapping => mapping.partnerRiderId)
            });

            if (taken) {
                throw new AppError(
                    `${taken.partner_name} ID ${taken.partner_rider_id} is already mapped to ${taken.rider_name} (${taken.rider_id})`,
                    409
                );
            }
        }

        const current = await partnerRepository.findActiveMappingsByRider(client, { riderId });

        const isKept = mapping => wanted.some(item =>
            item.partnerId === mapping.partner_id && item.partnerRiderId === mapping.partner_rider_id);

        const toEnd = current.filter(mapping => !isKept(mapping));
        const toAdd = wanted.filter(item => !current.some(mapping =>
            mapping.partner_id === item.partnerId && mapping.partner_rider_id === item.partnerRiderId));

        // End old mappings first: the new ID for the same partner would clash with them.
        if (toEnd.length > 0) {
            await partnerRepository.deactivateMappings(client, {
                mappingIds: toEnd.map(mapping => mapping.mapping_id)
            });
        }

        for (const mapping of toAdd) {
            await partnerRepository.insertMapping(client, { riderId, ...mapping });
        }

        const saved = await partnerRepository.findRiderWithMappings(client, { riderId });

        return {
            rider: toRider(saved),
            added: toAdd.length,
            removed: toEnd.length
        };
    });
}

module.exports = {
    normalizePartnerRiderId,
    getPartners,
    listRiderMappings,
    saveRiderMappings
};
