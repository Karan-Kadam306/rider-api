// Each partner sends its own sheet layout, keyed by partners.code.
// Supporting a new partner is one new file here, added to this list.
// period: 'daily' sheets have a row per day, so a week needs all 7 dates; 'weekly' ones store the week on its Monday.
module.exports = {
    blinkit: require('./blinkit'),
    zepto: require('./zepto'),
    zomato: require('./zomato')
};
