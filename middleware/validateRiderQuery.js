const AppError = require('../errors/AppError');

// Validate the request query parameters for retrieving riders.
// This middleware checks for valid pagination, sorting, and status filters.
function validateRiderQuery(req, res, next) {
    const rawPage = req.query.page;
    const rawLimit = req.query.limit;
    const rawSortBy = req.query.sortBy;
    const rawOrder = req.query.order;
    const rawStatus = req.query.status;

    // Reject repeated or non-string query parameters.
    const queryParams = [
        rawPage,
        rawLimit,
        rawSortBy,
        rawOrder,
        rawStatus
    ];

    if (
        queryParams.some(
            value => value !== undefined && typeof value !== 'string'
        )
    ) {
        return next(
            new AppError(
                'Query parameters must each have a single value',
                400
            )
        );
    }

    const page = Number(rawPage ?? 1);
    const limit = Number(rawLimit ?? 20);

    const sortBy = rawSortBy ?? 'created_at';
    const order = (rawOrder ?? 'desc').toLowerCase();

    const allowedSortColumns = [
        'name',
        'status',
        'created_at'
    ];

    const allowedStatuses = [
        'Active',
        'Inactive',
        'Terminated'
    ];

    // Validate pagination.
    if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100
    ) {
        return next(
            new AppError(
                'Page must be a positive integer and limit must be between 1 and 100',
                400
            )
        );
    }

    // Validate sorting.
    if (
        !allowedSortColumns.includes(sortBy) ||
        !['asc', 'desc'].includes(order)
    ) {
        return next(
            new AppError(
                'Invalid sortBy or order parameter',
                400
            )
        );
    }

    // Validate rider status.
    if (
        rawStatus !== undefined &&
        !allowedStatuses.includes(rawStatus)
    ) {
        return next(
        new AppError(
            'Invalid status. Allowed values: Active, Inactive, Terminated',
            400
        )
    );
}
    return next();
}

module.exports = { validateRiderQuery };
