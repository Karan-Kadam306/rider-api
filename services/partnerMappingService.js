const { pool, inTransaction } = require('../db');
const AppError = require('../errors/AppError');
const partnerRepository = require('../repositories/partnerRepository');
const partnerEarningsRepository = require('../repositories/partnerEarningsRepository');
const payoutRepository = require('../repositories/payoutRepository');

const VIEWS = ['unmapped', 'mapped'];
const RIDER_STATUSES = ['Active', 'Inactive', 'Terminated'];
const MAX_PARTNER_RIDER_ID_LENGTH = 100;

function isPositiveInteger(value) {
    return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

// Whether two lists hold the same IDs, in any order.
function sameIds(a, b) {
    const sortedA = a.map(Number).sort((x, y) => x - y);
    const sortedB = b.map(Number).sort((x, y) => x - y);

    return sortedA.length === sortedB.length && sortedA.every((id, index) => id === sortedB[index]);
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
// Pending earnings of a newly added ID, dated inside the new mapping, are matched to the rider in the same transaction.
// actingUserId is recorded as who made each change. Only admins may change or remove an ID, since that
// moves future earnings to someone else; staff may add IDs.
// currentMappingIds (optional) are the mapping IDs the editor showed: if the rider's mappings have changed
// since, the save is refused instead of silently undoing the other change.
async function saveRiderMappings({ actingUserId, actingUserRole, riderId, mappings, currentMappingIds }) {
    if (currentMappingIds !== undefined && (!Array.isArray(currentMappingIds) || !currentMappingIds.every(isPositiveInteger))) {
        throw new AppError('currentMappingIds must be a list of mapping IDs', 400);
    }

    const partners = await partnerRepository.findPartners(pool);
    const wanted = cleanMappings(mappings, new Map(partners.map(partner => [partner.partner_id, partner])));

    return inTransaction(client =>
        applyRiderMappings(client, { actingUserId, actingUserRole, riderId, partners, wanted, currentMappingIds })
    );
}

// Gives a rider created at approval their first partner IDs, inside the approval transaction.
async function addMappingsForNewRider(client, { actingUserId, actingUserRole, riderId, mappings }) {
    const partners = await partnerRepository.findPartners(client);
    const wanted = cleanMappings(mappings, new Map(partners.map(partner => [partner.partner_id, partner])));

    return applyRiderMappings(client, { actingUserId, actingUserRole, riderId, partners, wanted });
}

async function applyRiderMappings(client, { actingUserId, actingUserRole, riderId, partners, wanted, currentMappingIds }) {
    // Partners before the rider, the same order an earnings import takes them in.
    // Every partner, since the mappings this save ends are not known until the rider is locked.
    await partnerRepository.lockPartnersShared(client, {
        partnerIds: partners.map(partner => partner.partner_id)
    });

    const rider = await partnerRepository.lockRider(client, { riderId });

    if (!rider) {
        throw new AppError(`Rider not found: ${riderId}`, 404);
    }

    const current = await partnerRepository.findActiveMappingsByRider(client, { riderId });

    if (currentMappingIds !== undefined && !sameIds(currentMappingIds, current.map(mapping => mapping.mapping_id))) {
        throw new AppError(
            `Mappings for ${rider.name} changed since you opened them. Reload and try again.`,
            409
        );
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

    const isKept = mapping => wanted.some(item =>
        item.partnerId === mapping.partner_id && item.partnerRiderId === mapping.partner_rider_id);

    const toEnd = current.filter(mapping => !isKept(mapping));
    const toAdd = wanted.filter(item => !current.some(mapping =>
        mapping.partner_id === item.partnerId && mapping.partner_rider_id === item.partnerRiderId));

    if (toEnd.length > 0 && actingUserRole !== 'admin') {
        throw new AppError('Only an admin can change or remove a partner ID', 403);
    }

    // End old mappings first: the new ID for the same partner would clash with them.
    if (toEnd.length > 0) {
        await partnerRepository.deactivateMappings(client, {
            mappingIds: toEnd.map(mapping => mapping.mapping_id),
            deactivatedBy: actingUserId
        });
    }

    // Matching pending rows changes their weeks' payouts; wait for any payout of those weeks.
    const pendingDates = [];

    for (const mapping of toAdd) {
        pendingDates.push(...await partnerEarningsRepository.findEarningDates(client, { ...mapping, status: 'Pending' }));
    }

    await payoutRepository.lockWeeksShared(client, { dates: pendingDates });

    let matchedEarnings = 0;

    for (const mapping of toAdd) {
        await partnerRepository.insertMapping(client, { riderId, ...mapping, createdBy: actingUserId });
        // Pending rows dated before the ID came to this rider stay for review.
        matchedEarnings += await partnerEarningsRepository.matchPendingEarnings(client, {
            riderId,
            ...mapping,
            reviewedBy: actingUserId,
            onlyCoveredDates: true
        });
    }

    const saved = await partnerRepository.findRiderWithMappings(client, { riderId });

    return {
        rider: toRider(saved),
        added: toAdd.length,
        removed: toEnd.length,
        matchedEarnings
    };
}

module.exports = {
    MAX_PARTNER_RIDER_ID_LENGTH,
    normalizePartnerRiderId,
    getPartners,
    listRiderMappings,
    saveRiderMappings,
    addMappingsForNewRider
};
