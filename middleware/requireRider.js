const AppError = require('../errors/AppError');
const riderAuthService = require('../services/riderAuthService');

// The rider app sends its token as "Authorization: Bearer <token>". Cookies are never read here,
// so an admin panel session cannot be used on rider routes.
function readBearerToken(req) {
    const match = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.get('Authorization') ?? '');
    return match ? match[1] : null;
}

// Rejects requests without a valid rider app session; otherwise sets req.rider.
async function requireRider(req, res, next) {
    try {
        const rider = await riderAuthService.getSessionRider(readBearerToken(req));

        if (!rider) {
            return next(new AppError('Please sign in to continue', 401));
        }

        req.rider = rider;
        return next();
    } catch (error) {
        return next(error);
    }
}

module.exports = { requireRider, readBearerToken };
