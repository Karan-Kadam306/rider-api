const crypto = require('crypto');
const { pool, inTransaction } = require('../db');
const AppError = require('../errors/AppError');
const userRepository = require('../repositories/userRepository');
const sessionRepository = require('../repositories/sessionRepository');
const loginFailureRepository = require('../repositories/loginFailureRepository');
const { hashPassword, verifyPassword } = require('../utils/password');
const { toUser, normalizeEmail, assertPassword } = require('./userService');

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS) || 12;

// Failed sign-ins allowed inside the window before further attempts are refused.
const LOGIN_WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;

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

// Seconds until the oldest failure leaves the window, i.e. until one more attempt is allowed.
function secondsUntilRetry(oldestFailure) {
    const retryAt = new Date(oldestFailure).getTime() + LOGIN_WINDOW_MINUTES * 60 * 1000;
    return Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
}

// Refuses the attempt, without checking the password, once this email or IP has too many failures.
async function assertNotThrottled({ email, ipAddress }) {
    const recent = await loginFailureRepository.countRecent(pool, {
        email,
        ipAddress,
        windowMinutes: LOGIN_WINDOW_MINUTES
    });

    const waits = [];

    if (recent.email_failures >= MAX_FAILURES_PER_EMAIL) {
        waits.push(secondsUntilRetry(recent.email_oldest));
    }

    if (recent.ip_failures >= MAX_FAILURES_PER_IP) {
        waits.push(secondsUntilRetry(recent.ip_oldest));
    }

    if (waits.length) {
        const retryAfterSeconds = Math.max(...waits);
        const minutes = Math.ceil(retryAfterSeconds / 60);
        const error = new AppError(
            `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}`,
            429
        );
        error.retryAfterSeconds = retryAfterSeconds;
        throw error;
    }
}

// Unknown email, wrong password and inactive user all get the same answer.
async function login({ email, password, ipAddress = 'unknown' }) {
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
        throw new AppError('email and password are required', 400);
    }

    // Longer values cannot belong to a user; cutting them keeps the failure row valid.
    const cleanEmail = normalizeEmail(email).slice(0, 254);
    await assertNotThrottled({ email: cleanEmail, ipAddress });

    const user = await userRepository.findByEmail(pool, { email: cleanEmail });

    dummyHash ??= await hashPassword('not-a-real-password');
    const passwordMatches = await verifyPassword(password, user?.password_hash ?? dummyHash);

    if (!user || !passwordMatches || !user.is_active) {
        await loginFailureRepository.insertFailure(pool, { email: cleanEmail, ipAddress });
        throw new AppError('Invalid email or password', 401);
    }

    await loginFailureRepository.deleteForEmail(pool, { email: cleanEmail });
    await sessionRepository.deleteExpiredForUser(pool, { userId: user.user_id });
    const session = await createSession(user.user_id);
    await userRepository.recordLogin(pool, { userId: user.user_id });

    return { user: toUser(user), ...session };
}

// The signed-in user changes their own password. Wrong current passwords count towards the
// sign-in limits, so a left-open session cannot be used to guess the password.
// Every other session of the user ends; this one stays signed in.
async function changePassword({ userId, token, currentPassword, newPassword, ipAddress = 'unknown' }) {
    if (typeof currentPassword !== 'string' || !currentPassword) {
        throw new AppError('currentPassword is required', 400);
    }

    assertPassword(newPassword, 'newPassword');

    if (newPassword === currentPassword) {
        throw new AppError('The new password must be different from the current one', 400);
    }

    const user = await userRepository.findById(pool, { userId });
    await assertNotThrottled({ email: user.email, ipAddress });

    if (!await verifyPassword(currentPassword, user.password_hash)) {
        await loginFailureRepository.insertFailure(pool, { email: user.email, ipAddress });
        // 400, not 401: the session is still valid and the panel must not sign the user out.
        throw new AppError('Current password is incorrect', 400);
    }

    const passwordHash = await hashPassword(newPassword);

    await inTransaction(async client => {
        await userRepository.updatePassword(client, { userId, passwordHash });
        await sessionRepository.deleteAllForUser(client, { userId, exceptTokenHash: hashToken(token) });
        await loginFailureRepository.deleteForEmail(client, { email: user.email });
    });
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
    LOGIN_WINDOW_MINUTES,
    MAX_FAILURES_PER_EMAIL,
    MAX_FAILURES_PER_IP,
    createSession,
    login,
    changePassword,
    logout,
    getSessionUser
};
