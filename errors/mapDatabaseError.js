// This function maps database errors to user-friendly error messages and HTTP status codes.
function mapDatabaseError(error) {
    // Unique constraint violation.
    // PostgreSQL error code 23505 indicates a unique constraint violation.
    if (error.code === '23505') {
        if (error.constraint === 'riders_phone_key') {
            return {
                statusCode: 409,
                message: 'Phone number already registered'
            };
        }

        if (error.constraint === 'riders_pkey') {
            return {
                statusCode: 409,
                message: 'Rider ID Already Exists'
            };
        }

        if (error.constraint === 'bikes_chassis_number_key') {
            return {
                statusCode: 409,
                message: 'Chassis number already registered'
            };
        }

        if (error.constraint === 'bikes_registration_number_key') {
            return {
                statusCode: 409,
                message: 'Registration number already registered'
            };
        }

        // A different unique constraint was violated.
        return {
            statusCode: 409,
            message: 'A record with these details already exists'
        };
    }

    // Foreign-key violation.
    // PostgreSQL error code 23503 indicates a foreign key violation.
    if (error.code === '23503') {
        return {
            statusCode: 409,
            message: 'This operation conflicts with related records'
        };
    }

    // No known database error mapping.
    return null;
}

module.exports = mapDatabaseError;
