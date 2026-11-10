const partnerRepository = require('../repositories/partnerRepository');
const partnerEarningsRepository = require('../repositories/partnerEarningsRepository');

// Save one partner file's rows inside the caller's transaction.
// New rows are Matched when the partner ID is mapped to a rider, otherwise Pending for review.
// A re-uploaded row with the same amount is left alone; a new amount updates it.
async function importEarnings(client, { partnerId, entries, importId }) {
    const results = {
        matched: 0,
        pending: 0,
        updated: 0,
        unchanged: 0
    };

    // One import per partner at a time, so two uploads of the same file cannot both insert a row.
    await partnerRepository.lockPartner(client, { partnerId });

    const mappings = await partnerRepository.findActiveRidersByPartnerRiderIds(client, {
        partnerId,
        partnerRiderIds: [...new Set(entries.map(entry => entry.partnerRiderId))]
    });
    const riderIdByPartnerRiderId = new Map(mappings.map(row => [row.partner_rider_id, row.rider_id]));

    for (const entry of entries) {
        const mappedRiderId = riderIdByPartnerRiderId.get(entry.partnerRiderId) ?? null;

        const existing = await partnerEarningsRepository.findEarning(client, {
            partnerId,
            partnerRiderId: entry.partnerRiderId,
            earningDate: entry.earningDate
        });

        if (!existing) {
            await partnerEarningsRepository.insertEarning(client, {
                ...entry,
                partnerId,
                status: mappedRiderId ? 'Matched' : 'Pending',
                riderId: mappedRiderId,
                importId
            });

            if (mappedRiderId) {
                results.matched++;
            } else {
                results.pending++;
            }

            continue;
        }

        if (Number(existing.amount) === Number(entry.amount)) {
            results.unchanged++;
            continue;
        }

        // A matched row stays with its rider even if the mapping has changed since.
        // Pending and Dismissed rows are matched again, so a dismissed row with a new amount comes back for review.
        const riderId = existing.status === 'Matched' ? existing.rider_id : mappedRiderId;

        await partnerEarningsRepository.updateEarning(client, {
            earningId: existing.earning_id,
            amount: entry.amount,
            nameInFile: entry.nameInFile,
            status: riderId ? 'Matched' : 'Pending',
            riderId,
            importId
        });

        results.updated++;
    }

    return results;
}

module.exports = {
    importEarnings
};
