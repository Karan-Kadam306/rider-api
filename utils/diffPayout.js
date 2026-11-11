// The amounts a bill and a payout are compared on. netPayout is compared too (see amountsDiffer),
// since a balance carried from last week changes it without changing these.
const PAYOUT_FIELDS = ['rentalDays', 'totalRental', 'totalKm', 'totalEnergyCharge', 'totalAmount', 'earnings'];

const NO_AMOUNTS = { ...Object.fromEntries(PAYOUT_FIELDS.map(field => [field, 0])), netPayout: 0 };

function pickAmounts(source) {
    return {
        ...Object.fromEntries(PAYOUT_FIELDS.map(field => [field, source[field]])),
        netPayout: source.netPayout
    };
}

// A payout_items row as amounts. Payouts made before partner earnings have no earnings or net.
function toPaidAmounts(item) {
    return {
        rentalDays: item.rental_days,
        totalRental: item.total_rental,
        totalKm: item.total_km,
        totalEnergyCharge: item.total_energy_charge,
        totalAmount: item.total_amount,
        earnings: item.total_earnings,
        netPayout: item.net_payout
    };
}

function roundAmount(amount) {
    return Math.round(amount * 100) / 100;
}

// A payout from before partner earnings has no net; it was 0 earnings − deductions.
function paidNetPayout(paid) {
    return paid.netPayout ?? -paid.totalAmount;
}

// Missing earnings and net on an old payout count as above, so old payouts do not all show as changed.
function amountsDiffer(a, b) {
    return PAYOUT_FIELDS.some(field => (a[field] ?? 0) !== (b[field] ?? 0)) ||
        paidNetPayout(a) !== paidNetPayout(b);
}

// Riders whose live bill differs from what was deducted at payout, i.e. what a payout run would write.
// liveRiders: the week's bills (riders that need review are skipped; they block a payout).
// paidByRider: Map of riderId → paid amounts (same field names).
// A rider who was paid but no longer has a bill is changed to zero.
// difference is the change in deductions (totalAmount); netDifference the change in net payout.
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
                difference: roundAmount(current.totalAmount - (paid?.totalAmount ?? 0)),
                netDifference: roundAmount(current.netPayout - (paid ? paidNetPayout(paid) : 0))
            });
        }
    }

    for (const [riderId, paid] of paidByRider) {
        if (!seen.has(riderId) && amountsDiffer(paid, NO_AMOUNTS)) {
            changes.push({
                riderId,
                paid: pickAmounts(paid),
                current: { ...NO_AMOUNTS },
                difference: -paid.totalAmount,
                netDifference: -paidNetPayout(paid)
            });
        }
    }

    return changes;
}

module.exports = {
    pickAmounts,
    toPaidAmounts,
    paidNetPayout,
    diffPayout
};
