const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Zomato daily sheet: dates like "26 Oct 2026", amounts with thousands commas
// in Western ("1,250.50", "125,000") or Indian ("1,25,000") grouping.
module.exports = {
    period: 'daily',
    requiredColumns: ['Delivery Partner ID', 'Partner Name', 'Date', 'Payout (INR)'],
    idColumn: 'Delivery Partner ID',
    nameColumn: 'Partner Name',
    dateColumn: 'Date',
    amountColumn: 'Payout (INR)',
    amountPattern: /^-?(\d+|\d{1,3}(,\d{3})+|\d{1,2}(,\d{2})*,\d{3})(\.\d{1,2})?$/,
    amountExample: '1,250.50',
    dateError: 'Date must be a date like 26 Oct 2026',

    // "26 Oct 2026" -> "2026-10-26"; the month's case does not matter.
    readDate(row) {
        const match = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(row.Date);
        const month = match ? MONTHS.indexOf(match[2].toLowerCase()) + 1 : 0;

        if (month === 0) {
            return null;
        }

        return `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    }
};
