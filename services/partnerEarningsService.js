const { pool, inTransaction } = require('../db');
const AppError = require('../errors/AppError');
const partnerRepository = require('../repositories/partnerRepository');
const partnerEarningsRepository = require('../repositories/partnerEarningsRepository');
const { normalizePartnerRiderId } = require('./partnerMappingService');
const validateUsageDate = require('../utils/validateUsageDate');

const MAX_DISMISS_REASON_LENGTH = 500;

function isPositiveInteger(value) {
    return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function toPendingGroup(row) {
    return {
        partnerId: row.partner_id,
        partnerName: row.partner_name,
        partnerRiderId: row.partner_rider_id,
        nameInFile: row.name_in_file,
        entries: row.entries,
        totalAmount: Number(row.total_amount),
        firstDate: row.first_date,
        lastDate: row.last_date
    };
}

// Check the partner + ID a review action is for and return them cleaned.
function cleanPendingKey({ partnerId, partnerRiderId }) {
    if (!isPositiveInteger(partnerId)) {
        throw new AppError('A valid partnerId is required', 400);
    }

    const cleanId = typeof partnerRiderId === 'string' ? normalizePartnerRiderId(partnerRiderId) : '';

    if (!cleanId) {
        throw new AppError('partnerRiderId is required', 400);
    }

    return { partnerId: Number(partnerId), partnerRiderId: cleanId };
}

// Lock the partner for the rest of the transaction; 404 if it does not exist.
async function lockExistingPartner(client, partnerId) {
    const [partner] = await partnerRepository.lockPartnersShared(client, { partnerIds: [partnerId] });

    if (!partner) {
        throw new AppError('Partner not found', 404);
    }

    return partner;
}

function entryKey(partnerRiderId, earningDate) {
    return `${partnerRiderId}|${earningDate}`;
}

// Save one partner file's rows inside the caller's transaction, in a fixed number of queries.
// New rows are Matched to the rider who held the partner ID on the row's date, otherwise Pending for review.
// A re-uploaded row with the same amount is left alone; a new amount updates it.
// Open row errors from earlier files for these partner ID + date rows are closed, since this file supplies them.
async function importEarnings(client, { partnerId, entries, importId, uploadedBy = null }) {
    // One import per partner at a time, so two uploads of the same file cannot both insert a row.
    await partnerRepository.lockPartner(client, { partnerId });

    const [existingRows, riderRows] = await Promise.all([
        partnerEarningsRepository.findEarningsForUpdate(client, { partnerId, entries }),
        partnerRepository.findRidersForEntries(client, { partnerId, entries })
    ]);

    const existingByKey = new Map(existingRows.map(row => [entryKey(row.partner_rider_id, row.earning_date), row]));
    const riderIdByKey = new Map(riderRows.map(row => [entryKey(row.partner_rider_id, row.earning_date), row.rider_id]));

    const toInsert = [];
    const toUpdate = [];
    let unchanged = 0;

    for (const entry of entries) {
        const key = entryKey(entry.partnerRiderId, entry.earningDate);
        const mappedRiderId = riderIdByKey.get(key) ?? null;
        const existing = existingByKey.get(key);

        if (!existing) {
            toInsert.push({
                ...entry,
                status: mappedRiderId ? 'Matched' : 'Pending',
                riderId: mappedRiderId
            });
            continue;
        }

        // Compare as numbers: the database gives "850.00" while the sheet may say "850".
        if (Number(existing.amount) === Number(entry.amount)) {
            unchanged++;
            continue;
        }

        // A matched row stays with its rider even if the mapping has changed since.
        // Pending and Dismissed rows are matched again, so a dismissed row with a new amount comes back for review.
        const riderId = existing.status === 'Matched' ? existing.rider_id : mappedRiderId;

        toUpdate.push({
            earningId: existing.earning_id,
            amount: entry.amount,
            nameInFile: entry.nameInFile,
            status: riderId ? 'Matched' : 'Pending',
            riderId
        });
    }

    await partnerEarningsRepository.insertEarnings(client, { partnerId, importId, rows: toInsert });
    await partnerEarningsRepository.updateEarnings(client, { importId, rows: toUpdate });
    await partnerEarningsRepository.resolveRowErrors(client, { partnerId, entries, importId, resolvedBy: uploadedBy });

    return {
        matched: toInsert.filter(row => row.status === 'Matched').length,
        pending: toInsert.filter(row => row.status === 'Pending').length,
        updated: toUpdate.length,
        unchanged
    };
}

// One page of the Pending Review queue: one group per partner + ID, with its days and total.
async function listPendingEarnings({ partnerId, search, page = 1, limit = 20 }) {
    if (partnerId !== undefined && !isPositiveInteger(partnerId)) {
        throw new AppError('partnerId must be a positive integer', 400);
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
    const searchText = String(search ?? '').trim().slice(0, 100);
    const filters = {
        partnerId: partnerId === undefined ? null : Number(partnerId),
        search: searchText ? `%${searchText}%` : null
    };

    const [totalRecords, rows] = await Promise.all([
        partnerEarningsRepository.countPendingGroups(pool, filters),
        partnerEarningsRepository.findPendingGroups(pool, { ...filters, limit, offset })
    ]);

    return {
        pagination: {
            page,
            limit,
            offset,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limit)
        },
        count: rows.length,
        groups: rows.map(toPendingGroup)
    };
}

// Map an unknown partner ID to a rider and give them all of its pending earnings, in one transaction.
// actingUserId is recorded on the mapping and the matched rows.
async function resolvePendingEarnings({ actingUserId, partnerId, partnerRiderId, riderId }) {
    const key = cleanPendingKey({ partnerId, partnerRiderId });

    if (typeof riderId !== 'string' || !riderId.trim()) {
        throw new AppError('Choose the rider these earnings belong to', 400);
    }

    return inTransaction(async client => {
        const partner = await lockExistingPartner(client, key.partnerId);
        const rider = await partnerRepository.lockRider(client, { riderId: riderId.trim() });

        if (!rider) {
            throw new AppError(`Rider not found: ${riderId}`, 404);
        }

        const taken = await partnerRepository.findIdTakenByOtherRider(client, {
            riderId: rider.rider_id,
            partnerIds: [key.partnerId],
            partnerRiderIds: [key.partnerRiderId]
        });

        if (taken) {
            throw new AppError(
                `${partner.name} ID ${key.partnerRiderId} is already mapped to ${taken.rider_name} (${taken.rider_id})`,
                409
            );
        }

        // A rider has one ID per partner, so a different existing ID has to be changed on purpose.
        const current = (await partnerRepository.findActiveMappingsByRider(client, { riderId: rider.rider_id }))
            .find(mapping => mapping.partner_id === key.partnerId);

        if (current && current.partner_rider_id !== key.partnerRiderId) {
            throw new AppError(
                `${rider.name} already has ${partner.name} ID ${current.partner_rider_id}. Change it on Partner Mappings first.`,
                409
            );
        }

        const matchedEarnings = await partnerEarningsRepository.matchPendingEarnings(client, {
            ...key,
            riderId: rider.rider_id,
            reviewedBy: actingUserId
        });

        if (matchedEarnings === 0) {
            throw new AppError(`No pending ${partner.name} earnings for ${key.partnerRiderId}`, 404);
        }

        if (!current) {
            await partnerRepository.insertMapping(client, { riderId: rider.rider_id, ...key, createdBy: actingUserId });
        }

        return {
            riderId: rider.rider_id,
            riderName: rider.name,
            partnerName: partner.name,
            partnerRiderId: key.partnerRiderId,
            matchedEarnings
        };
    });
}

// Set an ID's pending earnings aside (test rows, another fleet's rider, ...). The reason and actingUserId are kept.
async function dismissPendingEarnings({ actingUserId, partnerId, partnerRiderId, reason }) {
    const key = cleanPendingKey({ partnerId, partnerRiderId });
    const cleanReason = typeof reason === 'string' ? reason.trim() : '';

    if (!cleanReason) {
        throw new AppError('Add a reason for dismissing these earnings', 400);
    }

    if (cleanReason.length > MAX_DISMISS_REASON_LENGTH) {
        throw new AppError(`Reason must be at most ${MAX_DISMISS_REASON_LENGTH} characters`, 400);
    }

    return inTransaction(async client => {
        const partner = await lockExistingPartner(client, key.partnerId);

        const dismissedEarnings = await partnerEarningsRepository.dismissPendingEarnings(client, {
            ...key,
            reason: cleanReason,
            reviewedBy: actingUserId
        });

        if (dismissedEarnings === 0) {
            throw new AppError(`No pending ${partner.name} earnings for ${key.partnerRiderId}`, 404);
        }

        return {
            partnerName: partner.name,
            partnerRiderId: key.partnerRiderId,
            dismissedEarnings
        };
    });
}

function toRowError(row) {
    return {
        errorId: row.error_id,
        importId: row.import_id,
        fileName: row.file_name,
        uploadedAt: row.uploaded_at,
        partnerId: row.partner_id,
        partnerName: row.partner_name,
        rowNumber: row.row_number,
        rowData: row.row_data,
        errorMessage: row.error_message,
        partnerRiderId: row.partner_rider_id,
        earningDate: row.earning_date
    };
}

// One page of earnings rows that failed to import and still block a payout.
async function listRowErrors({ partnerId, page = 1, limit = 20 }) {
    if (partnerId !== undefined && !isPositiveInteger(partnerId)) {
        throw new AppError('partnerId must be a positive integer', 400);
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
    const filters = { partnerId: partnerId === undefined ? null : Number(partnerId) };

    const [totalRecords, rows] = await Promise.all([
        partnerEarningsRepository.countOpenRowErrors(pool, filters),
        partnerEarningsRepository.findOpenRowErrors(pool, { ...filters, limit, offset })
    ]);

    return {
        pagination: {
            page,
            limit,
            offset,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limit)
        },
        count: rows.length,
        rowErrors: rows.map(toRowError)
    };
}

// Set a failed row aside when no corrected file will come (a blank line, a row already paid another way, ...).
async function dismissRowError({ actingUserId, errorId, note }) {
    if (!isPositiveInteger(errorId)) {
        throw new AppError('A valid errorId is required', 400);
    }

    const cleanNote = typeof note === 'string' ? note.trim() : '';

    if (!cleanNote) {
        throw new AppError('Add a note for dismissing this row', 400);
    }

    if (cleanNote.length > MAX_DISMISS_REASON_LENGTH) {
        throw new AppError(`Note must be at most ${MAX_DISMISS_REASON_LENGTH} characters`, 400);
    }

    const dismissed = await partnerEarningsRepository.dismissRowError(pool, {
        errorId: Number(errorId),
        note: cleanNote,
        resolvedBy: actingUserId
    });

    if (!dismissed) {
        throw new AppError('No open earnings row error with this ID', 404);
    }

    return {
        errorId: dismissed.error_id,
        rowNumber: dismissed.row_number,
        partnerRiderId: dismissed.partner_rider_id
    };
}

function toRiderTotal(row) {
    return {
        riderId: row.rider_id,
        riderName: row.rider_name,
        entries: row.entries,
        totalAmount: row.total_amount
    };
}

// Check a move request and return it cleaned. The dates are inclusive.
function cleanMoveRequest({ partnerId, partnerRiderId, riderId, fromDate, toDate }) {
    const key = cleanPendingKey({ partnerId, partnerRiderId });

    if (typeof riderId !== 'string' || !riderId.trim()) {
        throw new AppError('riderId is required', 400);
    }

    if (!validateUsageDate(fromDate) || !validateUsageDate(toDate) || fromDate > toDate) {
        throw new AppError('fromDate and toDate must be dates (YYYY-MM-DD), with fromDate first', 400);
    }

    return { ...key, riderId: riderId.trim(), fromDate, toDate };
}

// What moveEarnings would move: the ID's matched earnings in the dates held by other riders, per rider.
async function previewMove(request) {
    const rows = await partnerEarningsRepository.findMatchedWithOtherRiders(pool, cleanMoveRequest(request));
    return { riders: rows.map(toRiderTotal) };
}

// Fix earnings matched to the wrong rider: give the ID's matched earnings in the dates to the rider
// who holds the ID now. Map the ID to the right rider first; the next payout run applies the change.
async function moveEarnings({ actingUserId, ...request }) {
    const move = cleanMoveRequest(request);

    return inTransaction(async client => {
        // Partner before rider, the same order as an import and a mapping save.
        const partner = await lockExistingPartner(client, move.partnerId);
        const rider = await partnerRepository.lockRider(client, { riderId: move.riderId });

        if (!rider) {
            throw new AppError(`Rider not found: ${move.riderId}`, 404);
        }

        const holdsId = (await partnerRepository.findActiveMappingsByRider(client, { riderId: rider.rider_id }))
            .some(mapping => mapping.partner_id === move.partnerId && mapping.partner_rider_id === move.partnerRiderId);

        if (!holdsId) {
            throw new AppError(`Map ${partner.name} ID ${move.partnerRiderId} to ${rider.name} first`, 409);
        }

        const fromRiders = await partnerEarningsRepository.findMatchedWithOtherRiders(client, move);

        if (fromRiders.length === 0) {
            throw new AppError(`No ${partner.name} earnings for ${move.partnerRiderId} to move in these dates`, 404);
        }

        const movedEarnings = await partnerEarningsRepository.moveMatchedEarnings(client, {
            ...move,
            reviewedBy: actingUserId
        });

        return {
            riderId: rider.rider_id,
            riderName: rider.name,
            partnerName: partner.name,
            partnerRiderId: move.partnerRiderId,
            movedEarnings,
            fromRiders: fromRiders.map(toRiderTotal)
        };
    });
}

module.exports = {
    importEarnings,
    listPendingEarnings,
    resolvePendingEarnings,
    dismissPendingEarnings,
    listRowErrors,
    dismissRowError,
    previewMove,
    moveEarnings
};
