const DAILY_RENTAL_RATE = 59;

// Calculates the weekly rental for a specific rider, considering their status and any termination date.
function calculateWeeklyRental({
    weekStart,
    riderStatus,
    terminatedOn = null,
    inactivePeriods = [],
    eligibleDates = []
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
    let rentalDays = 0;

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

        rentalDays++;
    }

    return {
        riderStatus,
        weekStart,
        rentalDays,
        dailyRate: DAILY_RENTAL_RATE,
        totalRental: rentalDays * DAILY_RENTAL_RATE
    };
}

module.exports = {
    calculateWeeklyRental
};
