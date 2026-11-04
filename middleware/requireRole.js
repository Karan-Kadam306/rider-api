const AppError = require('../errors/AppError');

// Use after requireAuth: allows only the given roles, e.g. requireRole('admin').
function requireRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user?.role)) {
            return next(new AppError('You do not have permission to do this', 403));
        }

        return next();
    };
}

module.exports = { requireRole };
