const multer = require('multer');
const AppError = require('../errors/AppError');
const mapDatabaseError = require('../errors/mapDatabaseError');

// Error-handling middleware for Express.js applications.
// This middleware captures errors thrown in the application and sends appropriate HTTP responses.
function errorHandler(error, req, res, next) {
    // Expected errors are asserted by tests, so keep test output clean.
    if (process.env.NODE_ENV !== 'test') {
        console.error('API Error:', error);
    }

    if (res.headersSent) {
        return next(error);
    }

    // 1. Handle known application errors.
    if (error instanceof AppError) {
        if (error.retryAfterSeconds) {
            res.set('Retry-After', String(error.retryAfterSeconds));
        }

        return res.status(error.statusCode).json({
            error: error.message
        });
    }

    // 2. Handle upload errors (file too large, wrong form field, ...).
    if (error instanceof multer.MulterError) {
        return res.status(400).json({
            error: error.code === 'LIMIT_FILE_SIZE'
                ? 'File is too large. Maximum size is 5 MB'
                : error.message
        });
    }

    // 3. Handle request bodies express.json() could not read.
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({
            error: 'Request body is not valid JSON'
        });
    }

    if (error.type === 'entity.too.large') {
        return res.status(413).json({
            error: 'Request body is too large'
        });
    }

    // 4. Handle recognized PostgreSQL errors.
    const databaseError = mapDatabaseError(error);

    if (databaseError) {
        return res.status(databaseError.statusCode).json({
            error: databaseError.message
        });
    }

    // 5. Handle unexpected errors safely.
    return res.status(500).json({
        error: 'Internal server error'
    });
}

module.exports = { errorHandler };
