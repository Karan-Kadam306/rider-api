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
        return res.status(error.statusCode).json({
            error: error.message
        });
    }

    // 2. Handle recognized PostgreSQL errors.
    const databaseError = mapDatabaseError(error);

    if (databaseError) {
        return res.status(databaseError.statusCode).json({
            error: databaseError.message
        });
    }

    // 3. Handle unexpected errors safely.
    return res.status(500).json({
        error: 'Internal server error'
    });
}

module.exports = { errorHandler };
