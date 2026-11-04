const { pool } = require('../db');
const AppError = require('../errors/AppError');
const userRepository = require('../repositories/userRepository');
const { hashPassword } = require('../utils/password');

const ROLES = ['admin', 'staff'];
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The public shape of a user; never includes the password hash.
function toUser(row) {
    return {
        userId: row.user_id,
        email: row.email,
        name: row.name,
        role: row.role
    };
}

function normalizeEmail(email) {
    return String(email ?? '').trim().toLowerCase();
}

async function createUser({ email, name, password, role }) {
    const cleanEmail = normalizeEmail(email);
    const cleanName = String(name ?? '').trim();

    if (!EMAIL_PATTERN.test(cleanEmail) || cleanEmail.length > 254) {
        throw new AppError('A valid email is required', 400);
    }

    if (!cleanName || cleanName.length > 100) {
        throw new AppError('name is required (at most 100 characters)', 400);
    }

    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        throw new AppError(`password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400);
    }

    if (!ROLES.includes(role)) {
        throw new AppError(`role must be one of: ${ROLES.join(', ')}`, 400);
    }

    const row = await userRepository.insertUser(pool, {
        email: cleanEmail,
        name: cleanName,
        passwordHash: await hashPassword(password),
        role
    });

    return toUser(row);
}

module.exports = {
    ROLES,
    toUser,
    normalizeEmail,
    createUser
};
