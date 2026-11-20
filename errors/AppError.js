// Custom error class for application-specific errors.
// code is optional: a stable name the admin panel can react to, e.g. PROMISE_ACTIVE.
class AppError extends Error {
    constructor(message, statusCode, code = null) {
        super(message);

        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;

        Error.captureStackTrace?.(this, AppError);
    }
}

module.exports = AppError;
