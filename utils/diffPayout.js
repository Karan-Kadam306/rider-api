// The amounts a bill and a payout are compared on.
const PAYOUT_FIELDS = ['rentalDays', 'totalRental', 'totalKm', 'totalEnergyCharge', 'totalAmount'];

const NO_AMOUNTS = Object.fromEntries(PAYOUT_FIELDS.map(field => [field, 0]));

function pickAmounts(source) {
    return Object.fromEntries(PAYOUT_FIELDS.map(field => [field, source[field]]));
}

// A payout_items row as amounts.
function toPaidAmounts(item) {
    return {
        rentalDays: item.rental_days,
        totalRental: item.total_rental,
        totalKm: item.total_km,
        totalEnergyCharge: item.total_energy_charge,
        totalAmount: item.total_amount
    };
}

function amountsDiffer(a, b) {
    return PAYOUT_FIELDS.some(field => a[field] !== b[field]);
}

// Riders whose live bill differs from what was deducted at payout, i.e. what a payout run would write.
// liveRiders: the week's bills (riders that need review are skipped; they block a payout).
// paidByRider: Map of riderId → paid amounts (same field names).
// A rider who was paid but no longer has a bill is changed to zero.
function diffPayout(liveRiders, paidByRider) {
    const changes = [];
    const seen = new Set();

    for (const rider of liveRiders) {
        seen.add(rider.riderId);

        if (rider.requiresReview) {
            continue;
        }

        const current = pickAmounts(rider);
        const paid = paidByRider.get(rider.riderId) ?? null;

        // Nothing to pay and nothing paid before.
        if (!paid && !amountsDiffer(current, NO_AMOUNTS)) {
            continue;
        }

        if (!paid || amountsDiffer(current, paid)) {
            changes.push({
                riderId: rider.riderId,
                paid: paid && pickAmounts(paid),
                current,
                difference: Math.round((current.totalAmount - (paid?.totalAmount ?? 0)) * 100) / 100
            });
        }
    }

    for (const [riderId, paid] of paidByRider) {
        if (!seen.has(riderId) && amountsDiffer(paid, NO_AMOUNTS)) {
            changes.push({
                riderId,
                paid: pickAmounts(paid),
                current: { ...NO_AMOUNTS },
                difference: -paid.totalAmount
            });
        }
    }

    return changes;
}

module.exports = {
    pickAmounts,
    toPaidAmounts,
    diffPayout
};
