const AppError = require('../errors/AppError');

function validateUpdateRider(req, res, next) {
    const { name, phone, status } = req.body ?? {};

    // Validate required fields and their types.
    if (
        typeof name !== 'string' ||
        typeof phone !== 'string' ||
        typeof status !== 'string' ||
        !name.trim() ||
        !phone.trim() ||
        !status.trim()
    ) {
        return next(
            new AppError(
                'name, phone, and status are required and must be non-empty strings',
                400
            )
        );
    }

    // Validate name length and numbers.
    if (
        name.trim().length > 150 ||
        /\p{N}/u.test(name.trim()) ||
        !/\p{L}/u.test(name.trim())
    ) {
        return next(
            new AppError(
                'Name must contain letters, must not contain numbers, and must not exceed 150 characters',
                400
            )
        );
    }

    // Validate phone length and format.
    if (
        phone.trim().length > 30 ||
        !/^[6-9]\d{9}$/.test(phone.trim())
    ) {
        return next(
            new AppError(
                'Phone number must be a valid 10-digit Indian mobile number',
                400
            )
        );
    }

    // Validate allowed rider statuses.
    const allowedStatuses = [
        'Active',
        'Inactive',
        'Terminated'
    ];

    if (!allowedStatuses.includes(status.trim())) {
        return next(
            new AppError(
                'Invalid rider status',
                400
            )
        );
    }

    return next();
}

module.exports = { validateUpdateRider };
