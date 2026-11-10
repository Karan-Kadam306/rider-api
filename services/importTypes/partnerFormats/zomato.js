const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Zomato daily sheet: dates like "26 Oct 2026", amounts like "1,250.50".
module.exports = {
    requiredColumns: ['Delivery Partner ID', 'Partner Name', 'Date', 'Payout (INR)'],
    idColumn: 'Delivery Partner ID',
    nameColumn: 'Partner Name',
    amountColumn: 'Payout (INR)',
    dateError: 'Date must be a date like 26 Oct 2026',

    // "26 Oct 2026" -> "2026-10-26"
    readDate(row) {
        const match = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(row.Date);
        const month = match ? MONTHS.indexOf(match[2]) + 1 : 0;

        if (month === 0) {
            return null;
        }

        return `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    }
};
