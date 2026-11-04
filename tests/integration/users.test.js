const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { MAX_FAILURES_PER_EMAIL } = require('../../services/authService');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

// resetDb signs in this admin as user 1.
const ADMIN_ID = 1;
const NO_SESSION = { Cookie: '' };

function login(email, password = h.TEST_PASSWORD) {
    return h.api('POST', '/api/auth/login', { email, password }, NO_SESSION);
}

function sessionCount(userId) {
    return h.pool
        .query('SELECT count(*)::int AS count FROM sessions WHERE user_id = $1', [userId])
        .then(result => result.rows[0].count);
}

describe('Users API access', () => {
    it('is for admins only', async () => {
        const asStaff = { Cookie: await h.signIn(await h.createUser({ email: 'staff@test.local' })) };

        for (const [method, path] of [
            ['GET', '/api/users'],
            ['POST', '/api/users'],
            ['PATCH', `/api/users/${ADMIN_ID}`],
            ['POST', `/api/users/${ADMIN_ID}/password`]
        ]) {
            const response = await h.api(method, path, method === 'GET' ? undefined : {}, asStaff);
            assert.equal(response.status, 403, `${method} ${path}`);
        }
    });
});

describe('GET /api/users', () => {
    it('lists one status tab with counts for both tabs, sorted by name', async () => {
        await h.createUser({ email: 'zed@test.local' });
        await h.createUser({ email: 'amy@test.local', role: 'admin' });
        await h.createUser({ email: 'gone@test.local', isActive: false });

        const active = await h.api('GET', '/api/users');

        assert.equal(active.status, 200);
        assert.deepEqual(active.body.counts, { active: 3, inactive: 1 });
        assert.deepEqual(active.body.users.map(user => user.email),
            ['admin@test.local', 'amy@test.local', 'zed@test.local']);

        const user = active.body.users[0];
        assert.deepEqual(Object.keys(user).sort(),
            ['createdAt', 'email', 'isActive', 'lastLoginAt', 'name', 'role', 'userId']);

        const inactive = await h.api('GET', '/api/users?status=inactive');
        assert.deepEqual(inactive.body.users.map(row => row.email), ['gone@test.local']);
    });

    it('searches by name or email', async () => {
        await h.createUser({ email: 'ravi@test.local' });

        const response = await h.api('GET', '/api/users?search=RAVI');

        assert.deepEqual(response.body.users.map(user => user.email), ['ravi@test.local']);
    });

    it('rejects an unknown status', async () => {
        const response = await h.api('GET', '/api/users?status=deleted');

        assert.equal(response.status, 400);
    });
});

describe('POST /api/users', () => {
    const valid = { email: 'New@Test.Local', name: ' New User ', role: 'staff', password: 'starting-pass' };

    it('creates a user who can sign in with the starting password', async () => {
        const response = await h.api('POST', '/api/users', valid);

        assert.equal(response.status, 201);
        assert.equal(response.body.user.email, 'new@test.local');
        assert.equal(response.body.user.name, 'New User');
        assert.equal(response.body.user.isActive, true);
        assert.equal(response.body.user.password_hash, undefined);

        assert.equal((await login('new@test.local', 'starting-pass')).status, 200);
    });

    it('rejects bad input and a duplicate email', async () => {
        for (const body of [
            { ...valid, email: 'nope' },
            { ...valid, name: '' },
            { ...valid, role: 'owner' },
            { ...valid, password: 'short' },
            { ...valid, password: 'x'.repeat(129) }
        ]) {
            assert.equal((await h.api('POST', '/api/users', body)).status, 400);
        }

        const duplicate = await h.api('POST', '/api/users', { ...valid, email: 'admin@test.local' });
        assert.equal(duplicate.status, 409);
        assert.equal(duplicate.body.error, 'Email already registered');
    });
});

describe('PATCH /api/users/:userId', () => {
    it('changes name and role; the new role applies to existing sessions at once', async () => {
        const staffId = await h.createUser({ email: 'staff@test.local' });
        const asStaff = { Cookie: await h.signIn(staffId) };

        const response = await h.api('PATCH', `/api/users/${staffId}`, { name: 'Lead', role: 'admin' });

        assert.equal(response.status, 200);
        assert.equal(response.body.user.name, 'Lead');
        assert.equal(response.body.user.role, 'admin');

        const me = await h.api('GET', '/api/auth/me', undefined, asStaff);
        assert.equal(me.body.user.role, 'admin');
    });

    it('deactivating signs the user out everywhere and blocks sign-in; activating allows it again', async () => {
        const staffId = await h.createUser({ email: 'staff@test.local' });
        const asStaff = { Cookie: await h.signIn(staffId) };

        const response = await h.api('PATCH', `/api/users/${staffId}`, { isActive: false });

        assert.equal(response.status, 200);
        assert.equal(response.body.user.isActive, false);
        assert.equal(await sessionCount(staffId), 0);
        assert.equal((await h.api('GET', '/api/auth/me', undefined, asStaff)).status, 401);
        assert.equal((await login('staff@test.local')).status, 401);

        await h.api('PATCH', `/api/users/${staffId}`, { isActive: true });
        assert.equal((await login('staff@test.local')).status, 200);
    });

    it('does not let an admin change their own role or deactivate themselves', async () => {
        await h.createUser({ email: 'other-admin@test.local', role: 'admin' });

        for (const body of [{ role: 'staff' }, { isActive: false }]) {
            const response = await h.api('PATCH', `/api/users/${ADMIN_ID}`, body);

            assert.equal(response.status, 400);
            assert.equal(response.body.error, 'You cannot change your own role or deactivate yourself');
        }

        // Renaming yourself is fine.
        assert.equal((await h.api('PATCH', `/api/users/${ADMIN_ID}`, { name: 'Boss' })).status, 200);
    });

    it('lets an admin deactivate another admin', async () => {
        const secondId = await h.createUser({ email: 'second@test.local', role: 'admin' });

        const response = await h.api('PATCH', `/api/users/${secondId}`, { isActive: false });

        assert.equal(response.status, 200);
        assert.equal(response.body.user.isActive, false);
    });

    it('rejects a bad id, an unknown user and bad values', async () => {
        assert.equal((await h.api('PATCH', '/api/users/abc', { name: 'X' })).status, 400);
        assert.equal((await h.api('PATCH', '/api/users/999', { name: 'X' })).status, 404);

        const staffId = await h.createUser({ email: 'staff@test.local' });
        assert.equal((await h.api('PATCH', `/api/users/${staffId}`, { role: 'owner' })).status, 400);
        assert.equal((await h.api('PATCH', `/api/users/${staffId}`, { isActive: 'no' })).status, 400);
        assert.equal((await h.api('PATCH', `/api/users/${staffId}`, { name: ' ' })).status, 400);
    });
});

describe('userService.updateUser last-admin rule', () => {
    const userService = require('../../services/userService');

    it('refuses to demote or deactivate the last active admin', async () => {
        // Acting as a staff member bypasses the self-rule, so only the last-admin rule can stop it.
        const staffId = await h.createUser({ email: 'staff@test.local' });

        for (const change of [{ role: 'staff' }, { isActive: false }]) {
            await assert.rejects(
                userService.updateUser({ actingUserId: staffId, userId: ADMIN_ID, ...change }),
                { statusCode: 409, message: 'At least one active admin is required' }
            );
        }
    });

    it('allows two admins removing each other at the same time to leave one admin', async () => {
        const secondId = await h.createUser({ email: 'second@test.local', role: 'admin' });

        const results = await Promise.allSettled([
            userService.updateUser({ actingUserId: ADMIN_ID, userId: secondId, role: 'staff' }),
            userService.updateUser({ actingUserId: secondId, userId: ADMIN_ID, role: 'staff' })
        ]);

        assert.deepEqual(results.map(result => result.status).sort(), ['fulfilled', 'rejected']);

        const { rows: [{ count }] } = await h.pool.query(
            `SELECT count(*)::int AS count FROM users WHERE role = 'admin' AND is_active`
        );
        assert.equal(count, 1);
    });
});

describe('POST /api/users/:userId/password', () => {
    it('sets a new password and signs the user out everywhere', async () => {
        const staffId = await h.createUser({ email: 'staff@test.local' });
        await h.signIn(staffId);

        const response = await h.api('POST', `/api/users/${staffId}/password`, { password: 'brand-new-pass' });

        assert.equal(response.status, 200);
        assert.equal(await sessionCount(staffId), 0);
        assert.equal((await login('staff@test.local')).status, 401);
        assert.equal((await login('staff@test.local', 'brand-new-pass')).status, 200);
    });

    it('is not for your own account, and checks the password and user', async () => {
        const own = await h.api('POST', `/api/users/${ADMIN_ID}/password`, { password: 'brand-new-pass' });
        assert.equal(own.status, 400);
        assert.equal(own.body.error, 'Use Change password to change your own password');

        const staffId = await h.createUser({ email: 'staff@test.local' });
        assert.equal((await h.api('POST', `/api/users/${staffId}/password`, { password: 'short' })).status, 400);
        assert.equal((await h.api('POST', '/api/users/999/password', { password: 'brand-new-pass' })).status, 404);
    });
});

describe('POST /api/auth/password', () => {
    function changePassword(body, headers) {
        return h.api('POST', '/api/auth/password', body, headers);
    }

    it('changes your password, keeps this session and ends the others', async () => {
        const staffId = await h.createUser({ email: 'staff@test.local' });
        const thisBrowser = { Cookie: await h.signIn(staffId) };
        const otherBrowser = { Cookie: await h.signIn(staffId) };

        const response = await changePassword(
            { currentPassword: h.TEST_PASSWORD, newPassword: 'my-new-password' },
            thisBrowser
        );

        assert.equal(response.status, 200);
        assert.equal((await h.api('GET', '/api/auth/me', undefined, thisBrowser)).status, 200);
        assert.equal((await h.api('GET', '/api/auth/me', undefined, otherBrowser)).status, 401);
        assert.equal((await login('staff@test.local', 'my-new-password')).status, 200);
    });

    it('works for staff too', async () => {
        const asStaff = { Cookie: await h.signIn(await h.createUser({ email: 'staff@test.local' })) };

        const response = await changePassword({ currentPassword: h.TEST_PASSWORD, newPassword: 'my-new-password' }, asStaff);

        assert.equal(response.status, 200);
    });

    it('answers a wrong current password with 400 (not 401) and counts it as a failed sign-in', async () => {
        const response = await changePassword({ currentPassword: 'wrong-password', newPassword: 'my-new-password' });

        assert.equal(response.status, 400);
        assert.equal(response.body.error, 'Current password is incorrect');
        assert.equal((await h.api('GET', '/api/auth/me')).status, 200);

        for (let i = 1; i < MAX_FAILURES_PER_EMAIL; i++) {
            await changePassword({ currentPassword: 'wrong-password', newPassword: 'my-new-password' });
        }

        const blocked = await changePassword({ currentPassword: h.TEST_PASSWORD, newPassword: 'my-new-password' });
        assert.equal(blocked.status, 429);
    });

    it('rejects a missing, too short or unchanged password', async () => {
        assert.equal((await changePassword({ newPassword: 'my-new-password' })).status, 400);
        assert.equal((await changePassword({ currentPassword: h.TEST_PASSWORD, newPassword: 'short' })).status, 400);

        const same = await changePassword({ currentPassword: h.TEST_PASSWORD, newPassword: h.TEST_PASSWORD });
        assert.equal(same.status, 400);
        assert.equal(same.body.error, 'The new password must be different from the current one');
    });

    it('needs a session', async () => {
        const response = await changePassword({ currentPassword: 'x', newPassword: 'my-new-password' }, NO_SESSION);

        assert.equal(response.status, 401);
    });
});
