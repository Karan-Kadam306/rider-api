const { rateOn } = require('./rateOn');

// Calculates the weekly rental for a specific rider, considering their status and any termination date.
// Each day is charged at the postpaid rate in effect that day (rates: see utils/rateOn.js).
function calculateWeeklyRental({
    weekStart,
    riderStatus,
    terminatedOn = null,
    inactivePeriods = [],
    eligibleDates = [],
    rates
}) {
    const start = new Date(`${weekStart}T00:00:00.000Z`);

    if (
        Number.isNaN(start.getTime()) ||
        start.toISOString().slice(0, 10) !== weekStart ||
        start.getUTCDay() !== 1
    ) {
        throw new Error('weekStart must be a valid Monday in YYYY-MM-DD format');
    }

    const eligibleDateSet = new Set(eligibleDates);
    const dailyRates = new Set();
    let rentalDays = 0;
    let totalRental = 0;

    for (let offset = 0; offset < 7; offset++) {
        const date = new Date(start);
        date.setUTCDate(start.getUTCDate() + offset);

        const dateString = date.toISOString().slice(0, 10);

        // A rental charge requires an eligible bike/rider day.
        if (!eligibleDateSet.has(dateString)) {
            continue;
        }

        // Termination date is chargeable; later dates are not.
        if (terminatedOn && dateString > terminatedOn) {
            continue;
        }

        // Approved inactive periods exempt the matching dates.
        const isApprovedInactive = inactivePeriods.some(period =>
            period.approved &&
            dateString >= period.startDate &&
            dateString <= period.endDate
        );

        if (isApprovedInactive) {
            continue;
        }

        const { rentalPerDay } = rateOn(rates, dateString);

        rentalDays++;
        totalRental += rentalPerDay;
        dailyRates.add(rentalPerDay);
    }

    // dailyRate is the rate charged, or the week's starting rate when nothing was charged.
    // It is null when charged days had different rates, so no single rate explains the total.
    const [chargedRate] = dailyRates;

    return {
        riderStatus,
        weekStart,
        rentalDays,
        dailyRate: dailyRates.size > 1 ? null : chargedRate ?? rateOn(rates, weekStart).rentalPerDay,
        totalRental: Math.round(totalRental * 100) / 100
    };
}

module.exports = {
    calculateWeeklyRental
};
