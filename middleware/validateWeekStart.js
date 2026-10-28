const AppError = require('../errors/AppError');
const validateUsageDate = require('../utils/validateUsageDate');

function validateWeekStart(req, res, next) {
    // From the path (/weeks/:weekStart) or the query string (?weekStart=).
    const weekStart = req.params?.weekStart ?? req.query?.weekStart;

    // Billing weeks run Monday to Sunday.
    if (
        !validateUsageDate(weekStart) ||
        new Date(`${weekStart}T00:00:00.000Z`).getUTCDay() !== 1
    ) {
        return next(
            new AppError(
                'weekStart must be a Monday in YYYY-MM-DD format',
                400
            )
        );
    }

    return next();
}

module.exports = { validateWeekStart };
