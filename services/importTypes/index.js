// Every import type the Document Hub accepts, keyed by its import_type value.
// A new type (bike details, rider earnings, ...) is one new module added here.
const dailyKm = require('./dailyKm');
const partnerEarnings = require('./partnerEarnings');

const importTypes = new Map(
    [dailyKm, partnerEarnings].map(type => [type.key, type])
);

module.exports = importTypes;
