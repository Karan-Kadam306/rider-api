const crypto = require('crypto');
const { pool } = require('../db');
const AppError = require('../errors/AppError');
const userRepository = require('../repositories/userRepository');
const sessionRepository = require('../repositories/sessionRepository');
const { hashPassword, verifyPassword } = require('../utils/password');
const { toUser, normalizeEmail } = require('./userService');

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS) || 12;

// Checked when the email is unknown, so a wrong email takes as long as a wrong password.
let dummyHash;

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// Start a session for the user and return the raw token for the cookie.
async function createSession(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

    await sessionRepository.insertSession(pool, { tokenHash: hashToken(token), userId, expiresAt });

    return { token, expiresAt };
}

// Unknown email, wrong password and inactive user all get the same answer.
async function login({ email, password }) {
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
        throw new AppError('email and password are required', 400);
    }

    const user = await userRepository.findByEmail(pool, { email: normalizeEmail(email) });

    dummyHash ??= await hashPassword('not-a-real-password');
    const passwordMatches = await verifyPassword(password, user?.password_hash ?? dummyHash);

    if (!user || !passwordMatches || !user.is_active) {
        throw new AppError('Invalid email or password', 401);
    }

    await sessionRepository.deleteExpiredForUser(pool, { userId: user.user_id });
    const session = await createSession(user.user_id);
    await userRepository.recordLogin(pool, { userId: user.user_id });

    return { user: toUser(user), ...session };
}

async function logout(token) {
    if (token) {
        await sessionRepository.deleteSession(pool, { tokenHash: hashToken(token) });
    }
}

// The user behind a session token, or null if it is missing, expired or revoked.
async function getSessionUser(token) {
    if (!token) {
        return null;
    }

    const row = await sessionRepository.findActiveUser(pool, { tokenHash: hashToken(token) });
    return row ? toUser(row) : null;
}

module.exports = {
    createSession,
    login,
    logout,
    getSessionUser
};
