const { pool, inTransaction } = require('../db');
const AppError = require('../errors/AppError');
const userRepository = require('../repositories/userRepository');
const sessionRepository = require('../repositories/sessionRepository');
const { hashPassword } = require('../utils/password');

const ROLES = ['admin', 'staff'];
const STATUSES = ['active', 'inactive'];
const MIN_PASSWORD_LENGTH = 8;
// Long enough for any passphrase; stops huge values being hashed.
const MAX_PASSWORD_LENGTH = 128;
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

// The shape shown on the Users page.
function toManagedUser(row) {
    return {
        ...toUser(row),
        isActive: row.is_active,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at
    };
}

function normalizeEmail(email) {
    return String(email ?? '').trim().toLowerCase();
}

function cleanName(name) {
    const clean = String(name ?? '').trim();

    if (!clean || clean.length > 100) {
        throw new AppError('name is required (at most 100 characters)', 400);
    }

    return clean;
}

function assertRole(role) {
    if (!ROLES.includes(role)) {
        throw new AppError(`role must be one of: ${ROLES.join(', ')}`, 400);
    }
}

function assertPassword(password, field = 'password') {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
        throw new AppError(
            `${field} must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters`,
            400
        );
    }
}

function parseUserId(userId) {
    if (!/^\d{1,15}$/.test(String(userId)) || Number(userId) < 1) {
        throw new AppError('userId must be a positive whole number', 400);
    }

    return Number(userId);
}

async function createUser({ email, name, password, role }) {
    const cleanEmail = normalizeEmail(email);

    if (!EMAIL_PATTERN.test(cleanEmail) || cleanEmail.length > 254) {
        throw new AppError('A valid email is required', 400);
    }

    const validName = cleanName(name);
    assertPassword(password);
    assertRole(role);

    const row = await userRepository.insertUser(pool, {
        email: cleanEmail,
        name: validName,
        passwordHash: await hashPassword(password),
        role
    });

    return toManagedUser(row);
}

// Users for one status tab, plus the count for each tab.
async function listUsers({ status = 'active', search } = {}) {
    if (!STATUSES.includes(status)) {
        throw new AppError(`status must be one of: ${STATUSES.join(', ')}`, 400);
    }

    const cleanSearch = String(search ?? '').trim().slice(0, 100);

    const [rows, counts] = await Promise.all([
        userRepository.listUsers(pool, { status, search: cleanSearch || null }),
        userRepository.countByStatus(pool)
    ]);

    return { users: rows.map(toManagedUser), counts };
}

// Change name, role or active status. Fields left out keep their value.
// An admin cannot change their own role or deactivate themselves, and the last active admin
// cannot be removed, so the panel always has someone who can manage users.
async function updateUser({ actingUserId, userId, name, role, isActive }) {
    const targetId = parseUserId(userId);

    if (name !== undefined) {
        name = cleanName(name);
    }

    if (role !== undefined) {
        assertRole(role);
    }

    if (isActive !== undefined && typeof isActive !== 'boolean') {
        throw new AppError('isActive must be true or false', 400);
    }

    return inTransaction(async client => {
        // Lock admins first, then the target, always in this order, so concurrent edits cannot deadlock.
        const activeAdminIds = await userRepository.lockActiveAdminIds(client);
        const user = await userRepository.findById(client, { userId: targetId, forUpdate: true });

        if (!user) {
            throw new AppError('User not found', 404);
        }

        const next = {
            name: name ?? user.name,
            role: role ?? user.role,
            isActive: isActive ?? user.is_active
        };

        if (targetId === actingUserId && (next.role !== user.role || !next.isActive)) {
            throw new AppError('You cannot change your own role or deactivate yourself', 400);
        }

        const losesAdmin = activeAdminIds.includes(targetId) && (next.role !== 'admin' || !next.isActive);

        if (losesAdmin && activeAdminIds.length === 1) {
            throw new AppError('At least one active admin is required', 409);
        }

        const updated = await userRepository.updateUser(client, { userId: targetId, ...next });

        // A deactivated user is signed out everywhere straight away.
        if (!next.isActive) {
            await sessionRepository.deleteAllForUser(client, { userId: targetId });
        }

        return toManagedUser(updated);
    });
}

// An admin sets a new password for someone else, e.g. when they forgot it.
// That user is signed out everywhere and must sign in with the new password.
async function resetPassword({ actingUserId, userId, password }) {
    const targetId = parseUserId(userId);

    if (targetId === actingUserId) {
        throw new AppError('Use Change password to change your own password', 400);
    }

    assertPassword(password);
    const passwordHash = await hashPassword(password);

    return inTransaction(async client => {
        const user = await userRepository.findById(client, { userId: targetId, forUpdate: true });

        if (!user) {
            throw new AppError('User not found', 404);
        }

        await userRepository.updatePassword(client, { userId: targetId, passwordHash });
        await sessionRepository.deleteAllForUser(client, { userId: targetId });

        return toManagedUser(user);
    });
}

module.exports = {
    ROLES,
    toUser,
    normalizeEmail,
    assertPassword,
    createUser,
    listUsers,
    updateUser,
    resetPassword
};
