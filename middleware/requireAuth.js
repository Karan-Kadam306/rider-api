const AppError = require('../errors/AppError');
const authService = require('../services/authService');
const { readSessionToken } = require('../utils/sessionCookie');

// Rejects requests without a valid session; otherwise sets req.user.
async function requireAuth(req, res, next) {
    try {
        const user = await authService.getSessionUser(readSessionToken(req));

        if (!user) {
            return next(new AppError('Please sign in to continue', 401));
        }

        req.user = user;
        return next();
    } catch (error) {
        return next(error);
    }
}

module.exports = { requireAuth };
