// Blinkit daily sheet: one row per rider per day, dates like 26-10-2026.
module.exports = {
    requiredColumns: ['Partner ID', 'Rider Name', 'Order Date', 'Total Earnings'],
    idColumn: 'Partner ID',
    nameColumn: 'Rider Name',
    amountColumn: 'Total Earnings',
    dateError: 'Order Date must be a date like 26-10-2026',

    // "26-10-2026" -> "2026-10-26"
    readDate(row) {
        const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(row['Order Date']);
        return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
    }
};
