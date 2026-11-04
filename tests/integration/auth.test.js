const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const userService = require('../../services/userService');
const { MAX_FAILURES_PER_EMAIL, MAX_FAILURES_PER_IP } = require('../../services/authService');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

const NO_SESSION = { Cookie: '' };

function login(email, password = h.TEST_PASSWORD) {
    return h.api('POST', '/api/auth/login', { email, password }, NO_SESSION);
}

// "rider_session=<token>" from a Set-Cookie header.
function sessionCookie(response) {
    return response.headers.get('set-cookie').split(';')[0];
}

describe('POST /api/auth/login', () => {
    it('signs in, sets a protected cookie and returns the user', async () => {
        await h.createUser({ email: 'staff@test.local', role: 'staff' });

        const response = await login('  Staff@Test.Local ');

        assert.equal(response.status, 200);
        assert.deepEqual(response.body.user, {
            userId: 2,
            email: 'staff@test.local',
            name: 'User staff@test.local',
            role: 'staff'
        });

        const setCookie = response.headers.get('set-cookie');
        assert.match(setCookie, /^rider_session=[\w-]{43};/);
        assert.match(setCookie, /HttpOnly/);
        assert.match(setCookie, /SameSite=Strict/);

        const me = await h.api('GET', '/api/auth/me', undefined, { Cookie: sessionCookie(response) });
        assert.equal(me.status, 200);
        assert.equal(me.body.user.email, 'staff@test.local');

        const { rows: [user] } = await h.pool.query('SELECT last_login_at FROM users WHERE user_id = 2');
        assert.ok(user.last_login_at);
    });

    it('gives the same answer for a wrong password, an unknown email and an inactive user', async () => {
        await h.createUser({ email: 'staff@test.local' });
        await h.createUser({ email: 'gone@test.local', isActive: false });

        for (const response of [
            await login('staff@test.local', 'wrong-password'),
            await login('nobody@test.local'),
            await login('gone@test.local')
        ]) {
            assert.equal(response.status, 401);
            assert.equal(response.body.error, 'Invalid email or password');
            assert.equal(response.headers.get('set-cookie'), null);
        }
    });

    it('rejects a missing email or password', async () => {
        const response = await h.api('POST', '/api/auth/login', { email: 'staff@test.local' }, NO_SESSION);

        assert.equal(response.status, 400);
        assert.equal(response.body.error, 'email and password are required');
    });
});

describe('Sign-in attempt limits', () => {
    async function failTimes(count, email = 'staff@test.local') {
        for (let i = 0; i < count; i++) {
            assert.equal((await login(email, 'wrong-password')).status, 401);
        }
    }

    it('blocks an email after too many failures, even with the right password', async () => {
        await h.createUser({ email: 'staff@test.local' });
        await failTimes(MAX_FAILURES_PER_EMAIL);

        const response = await login('STAFF@test.local');

        assert.equal(response.status, 429);
        assert.equal(response.body.error, 'Too many failed sign-in attempts. Try again in 15 minutes');
        assert.ok(Number(response.headers.get('retry-after')) > 14 * 60);
        assert.equal(response.headers.get('set-cookie'), null);

        // Blocked attempts are not recorded, so the wait does not keep growing.
        const { rows: [{ count }] } = await h.pool.query('SELECT count(*)::int AS count FROM login_failures');
        assert.equal(count, MAX_FAILURES_PER_EMAIL);
    });

    it('allows sign-in again once the failures are older than the window', async () => {
        await h.createUser({ email: 'staff@test.local' });
        await failTimes(MAX_FAILURES_PER_EMAIL);
        await h.pool.query(`UPDATE login_failures SET failed_at = now() - interval '16 minutes'`);

        assert.equal((await login('staff@test.local')).status, 200);
    });

    it('clears the failures for that email after a successful sign-in', async () => {
        await h.createUser({ email: 'staff@test.local' });
        await failTimes(MAX_FAILURES_PER_EMAIL - 1);

        assert.equal((await login('staff@test.local')).status, 200);

        await failTimes(MAX_FAILURES_PER_EMAIL - 1);
        assert.equal((await login('staff@test.local')).status, 200);
    });

    it('does not block other emails because one email is blocked', async () => {
        await h.createUser({ email: 'staff@test.local' });
        await failTimes(MAX_FAILURES_PER_EMAIL, 'nobody@test.local');

        assert.equal((await login('staff@test.local')).status, 200);
    });

    it('blocks an IP address that tries too many emails', async () => {
        await h.createUser({ email: 'staff@test.local' });

        // One real failure shows the test client's address; the rest are inserted directly
        // because hashing every attempt is slow.
        await login('guess1@test.local', 'wrong-password');
        const { rows: [{ ip }] } = await h.pool.query('SELECT ip_address AS ip FROM login_failures');

        await h.pool.query(
            `INSERT INTO login_failures (email, ip_address)
             SELECT 'guess' || n || '@test.local', $1 FROM generate_series(2, $2) AS n`,
            [ip, MAX_FAILURES_PER_IP]
        );

        const response = await login('staff@test.local');

        assert.equal(response.status, 429);
    });
});

describe('Protected routes', () => {
    it('need a session; /health stays public', async () => {
        const riders = await h.api('GET', '/api/riders', undefined, NO_SESSION);
        assert.equal(riders.status, 401);
        assert.equal(riders.body.error, 'Please sign in to continue');

        const health = await h.api('GET', '/health', undefined, NO_SESSION);
        assert.equal(health.status, 200);
    });

    it('reject an unknown token', async () => {
        const response = await h.api('GET', '/api/riders', undefined, { Cookie: 'rider_session=made-up' });

        assert.equal(response.status, 401);
    });

    it('reject an expired session', async () => {
        await h.pool.query(`UPDATE sessions SET expires_at = now() - interval '1 minute'`);

        const response = await h.api('GET', '/api/riders');

        assert.equal(response.status, 401);
    });

    it('stop working once the user is deactivated', async () => {
        await h.pool.query('UPDATE users SET is_active = false');

        const response = await h.api('GET', '/api/riders');

        assert.equal(response.status, 401);
    });
});

describe('POST /api/auth/logout', () => {
    it('ends the session and clears the cookie', async () => {
        const response = await h.api('POST', '/api/auth/logout');

        assert.equal(response.status, 200);
        assert.match(response.headers.get('set-cookie'), /^rider_session=;/);

        const after = await h.api('GET', '/api/auth/me');
        assert.equal(after.status, 401);
    });

    it('is safe to call when already signed out', async () => {
        const response = await h.api('POST', '/api/auth/logout', undefined, NO_SESSION);

        assert.equal(response.status, 200);
    });
});

describe('Roles', () => {
    const WEEK = '2026-10-12';

    it('staff can read billing but cannot close a week or run a payout', async () => {
        const staffCookie = await h.signIn(await h.createUser({ email: 'staff@test.local' }));
        const asStaff = { Cookie: staffCookie };

        const bills = await h.api('GET', `/api/billing/bills?weekStart=${WEEK}`, undefined, asStaff);
        assert.equal(bills.status, 200);

        for (const path of [`/api/billing/weeks/${WEEK}/close`, `/api/payouts/weeks/${WEEK}/run`]) {
            const response = await h.api('POST', path, undefined, asStaff);

            assert.equal(response.status, 403);
            assert.equal(response.body.error, 'You do not have permission to do this');
        }
    });

    it('admins can run a payout', async () => {
        await h.createRider('YS-001');
        await h.createAssignment(await h.createBike('VIN-1'), 'YS-001', '2026-10-01 09:00');

        const response = await h.api('POST', `/api/payouts/weeks/${WEEK}/run`);

        assert.equal(response.status, 201);
    });
});

describe('userService.createUser', () => {
    const valid = { email: 'New@Test.Local', name: 'New User', password: 'long-enough', role: 'staff' };

    it('stores the email in lowercase and never returns the hash', async () => {
        const user = await userService.createUser(valid);

        assert.deepEqual(user, {
            userId: 2,
            email: 'new@test.local',
            name: 'New User',
            role: 'staff',
            isActive: true,
            createdAt: user.createdAt,
            lastLoginAt: null
        });

        const { rows: [row] } = await h.pool.query('SELECT password_hash FROM users WHERE user_id = 2');
        assert.match(row.password_hash, /^scrypt:/);
        assert.equal((await login('new@test.local', 'long-enough')).status, 200);
    });

    it('rejects bad input and duplicate emails', async () => {
        await assert.rejects(userService.createUser({ ...valid, email: 'not-an-email' }), { statusCode: 400 });
        await assert.rejects(userService.createUser({ ...valid, password: 'short' }), { statusCode: 400 });
        await assert.rejects(userService.createUser({ ...valid, role: 'owner' }), { statusCode: 400 });
        await assert.rejects(userService.createUser({ ...valid, email: 'admin@test.local' }), { code: '23505' });
    });
});
