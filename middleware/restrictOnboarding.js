const AppError = require('../errors/AppError');

// Everything an onboarding user may call, relative to /api. Anything not listed is refused, so a
// new route stays closed to them until it is added here on purpose. They never see money:
// billing, payouts, earnings and escalations stay closed.
// method '*': any method; the routes themselves check the role.
const ONBOARDING_ROUTES = [
    { method: 'GET', pattern: /^\/riders\/?$/ },
    { method: 'GET', pattern: /^\/riders\/summary\/?$/ },
    { method: 'GET', pattern: /^\/hubs\/?$/ },
    { method: '*', pattern: /^\/onboarding(\/|$)/ }
];

function isAllowed(method, path) {
    return ONBOARDING_ROUTES.some(route => (route.method === '*' || route.method === method) && route.pattern.test(path));
}

// Use after requireAuth on /api. Other roles pass straight through.
function restrictOnboarding(req, res, next) {
    if (req.user?.role !== 'onboarding') {
        return next();
    }

    if (!isAllowed(req.method, req.path)) {
        return next(new AppError('Onboarding users can only open Rider Management', 403));
    }

    return next();
}

module.exports = { restrictOnboarding, ONBOARDING_ROUTES };
