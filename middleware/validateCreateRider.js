const AppError = require('../errors/AppError');

// Validate the request body for creating a new rider.
function validateCreateRider(req, res, next) {
    const { rider_id, name, phone } = req.body ?? {};

    // Validate required fields.
    if (
        typeof rider_id !== 'string' ||
        typeof name !== 'string' ||
        typeof phone !== 'string' ||
        !rider_id.trim() ||
        !name.trim() ||
        !phone.trim()
    ) {
        return next(
            new AppError(
                'rider_id, name, and phone are required and must be non-empty strings',
                400
            )
        );
    }
    
    // Validate the Indian mobile number.
    if (!/^[6-9]\d{9}$/.test(phone.trim())) {
        return next(
            new AppError(
                'Phone number must be a valid 10-digit Indian mobile number',
                400
            )
        );
    }

    // Reject names containing numbers.
    if (/\p{N}/u.test(name.trim())) {
        return next(
            new AppError(
                'Name must not contain numbers',
                400
            )
        );
    }

    // Ensure the name contains at least one letter.
    if (!/\p{L}/u.test(name.trim())) {
        return next(
            new AppError(
                'Name must contain at least one letter',
                400
            )
        );
    }

    // Reject values that exceed reasonable field lengths.
    if (
        rider_id.trim().length > 100 ||
        name.trim().length > 150 ||
        phone.trim().length > 30
    ) {
        return next(
            new AppError(
                'One or more rider fields exceed the allowed length',
                400
            )
        );
    }

    return next();
}

module.exports = { validateCreateRider };
