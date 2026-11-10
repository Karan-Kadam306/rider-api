const validateUsageDate = require('../../../utils/validateUsageDate');

// Zepto weekly sheet: one row per rider per Monday-Sunday week, no rider name.
// The week's total is stored on its Monday.
module.exports = {
    requiredColumns: ['Zepto Rider ID', 'Week Start', 'Week End', 'Net Payable'],
    idColumn: 'Zepto Rider ID',
    nameColumn: null,
    amountColumn: 'Net Payable',
    dateError: 'Week Start must be a Monday and Week End the Sunday after it (YYYY-MM-DD)',

    readDate(row) {
        const weekStart = row['Week Start'];

        if (!validateUsageDate(weekStart)) {
            return null;
        }

        const sunday = new Date(`${weekStart}T00:00:00Z`);
        sunday.setUTCDate(sunday.getUTCDate() + 6);

        const isMonday = sunday.getUTCDay() === 0;
        const endsOnSunday = sunday.toISOString().slice(0, 10) === row['Week End'];

        return isMonday && endsOnSunday ? weekStart : null;
    }
};
