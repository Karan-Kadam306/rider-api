const dailyKmService = require('../dailyKmService');

// Daily KM import: one row per bike (VIN) with the KM ridden on the work date.
module.exports = {
    key: 'daily_km',
    label: 'Daily KM',
    requiresWorkDate: true,
    requiredColumns: ['VIN', 'KM'],

    // Return a Map of row index -> reason for every row that cannot be imported.
    // lineNumbers[i] is the line of rows[i] in the file, used in messages.
    findRowErrors(rows, lineNumbers) {
        const errors = new Map();
        const firstIndexByVin = new Map();

        rows.forEach((row, index) => {
            const vin = row.VIN ?? '';
            const kmText = row.KM ?? '';
            const km = Number(kmText);

            if (!vin) {
                errors.set(index, 'VIN is required');
            } else if (!kmText) {
                errors.set(index, 'KM is required');
            } else if (!Number.isFinite(km) || km < 0) {
                errors.set(index, 'KM must be a number of 0 or more');
            } else if (firstIndexByVin.has(vin)) {
                // A second row for the same VIN would silently overwrite the first.
                errors.set(index, `VIN already appears on line ${lineNumbers[firstIndexByVin.get(vin)]}`);
            } else {
                firstIndexByVin.set(vin, index);
            }
        });

        return errors;
    },

    // Save the valid rows inside the caller's transaction.
    importRows(client, rows, { workDate, fileName }) {
        return dailyKmService.processDailyKmRows(client, {
            rows,
            usageDate: workDate,
            fileName
        });
    }
};
