
function mapDatabaseError(error) {
    // Duplicate key violation.
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

        // A different unique constraint was violated.
        return {
            statusCode: 409,
            message: 'A record with these details already exists'
        };
    }

    // Foreign-key violation.
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
