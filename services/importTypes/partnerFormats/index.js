// Each partner sends its own sheet layout, keyed by partners.code.
// Supporting a new partner is one new file here, added to this list.
module.exports = {
    blinkit: require('./blinkit'),
    zepto: require('./zepto'),
    zomato: require('./zomato')
};
