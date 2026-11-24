// The postpaid rate in effect on a date (YYYY-MM-DD).
// rates: [{ effectiveFrom, rentalPerDay, energyPerKm }] sorted by effectiveFrom, oldest first.
function rateOn(rates, date) {
    let current = null;

    for (const rate of rates) {
        if (rate.effectiveFrom > date) {
            break;
        }

        current = rate;
    }

    if (!current) {
        throw new Error(`No postpaid rate is in effect on ${date}`);
    }

    return current;
}

// The rates in effect on any day from fromDate to toDate (inclusive), oldest first.
function ratesDuring(rates, fromDate, toDate) {
    const first = rateOn(rates, fromDate);
    return rates.filter(rate => rate === first || (rate.effectiveFrom > fromDate && rate.effectiveFrom <= toDate));
}

module.exports = { rateOn, ratesDuring };
