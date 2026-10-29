// Validates that a usageDate is in the correct YYYY-MM-DD format.
function validateUsageDate(value) {
    if (typeof value !== 'string') {
        return false;
    }

    // Require the exact YYYY-MM-DD format.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const [year, month, day] = value.split('-').map(Number);

    // Check that the date actually exists on the calendar.
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

module.exports = validateUsageDate;
