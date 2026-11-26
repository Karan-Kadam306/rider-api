const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

async function createOnboardingUser() {
    const userId = await h.createUser({ email: 'onboarding@test.local', role: 'onboarding' });
    return { userId, cookie: { Cookie: await h.signIn(userId) } };
}

describe('Onboarding role', () => {
    it('can be given to a user by an admin', async () => {
        const created = await h.api('POST', '/api/users', {
            email: 'exec@test.local', name: 'Onboarding Exec', role: 'onboarding', password: 'starting-pass'
        });
        const staffId = await h.createUser({ email: 'staff@test.local' });
        const changed = await h.api('PATCH', `/api/users/${staffId}`, { role: 'onboarding' });

        assert.equal(created.status, 201);
        assert.equal(created.body.user.role, 'onboarding');
        assert.equal(changed.status, 200);
        assert.equal(changed.body.user.role, 'onboarding');
    });

    it('opens the riders list, its counts and the hubs', async () => {
        const user = await createOnboardingUser();
        await h.createRider('YS-001');

        const riders = await h.api('GET', '/api/riders?status=Active', undefined, user.cookie);
        const summary = await h.api('GET', '/api/riders/summary', undefined, user.cookie);
        const hubs = await h.api('GET', '/api/hubs', undefined, user.cookie);

        assert.equal(riders.status, 200);
        assert.deepEqual(riders.body.riders.map(r => r.rider_id), ['YS-001']);
        assert.equal(summary.status, 200);
        assert.equal(hubs.status, 200);
    });

    it('is refused everything else, including money and rider changes', async () => {
        const user = await createOnboardingUser();
        await h.createRider('YS-001');
        const week = h.currentWeekStart();

        for (const [method, path] of [
            ['POST', '/api/riders'],
            ['GET', '/api/riders/YS-001'],
            ['GET', '/api/riders/YS-001/profile'],
            ['GET', '/api/riders/YS-001/payouts'],
            ['GET', '/api/riders/YS-001/escalations'],
            ['POST', '/api/riders/YS-001/escalations'],
            ['PUT', '/api/riders/YS-001'],
            ['DELETE', '/api/riders/YS-001'],
            ['POST', '/api/hubs'],
            ['PATCH', `/api/hubs/${h.getDefaultHubId()}`],
            ['GET', '/api/bikes'],
            ['GET', '/api/pricing'],
            ['GET', '/api/daily-km'],
            ['GET', `/api/billing/summary?weekStart=${week}`],
            ['GET', `/api/dashboard?weekStart=${week}`],
            ['GET', '/api/payouts/recent'],
            ['GET', '/api/analytics'],
            ['GET', '/api/imports'],
            ['GET', '/api/partners'],
            ['GET', '/api/partner-earnings/pending'],
            ['GET', '/api/users'],
            ['GET', '/api/tl/riders']
        ]) {
            const res = await h.api(method, path, method === 'GET' ? undefined : {}, user.cookie);
            assert.equal(res.status, 403, `${method} ${path}`);
            assert.equal(res.body.error, 'Onboarding users can only open Rider Management', `${method} ${path}`);
        }
    });

    it('can still check their session and change their password', async () => {
        const user = await createOnboardingUser();

        const me = await h.api('GET', '/api/auth/me', undefined, user.cookie);
        const password = await h.api(
            'POST',
            '/api/auth/password',
            { currentPassword: h.TEST_PASSWORD, newPassword: 'a-new-password-1' },
            user.cookie
        );

        assert.equal(me.status, 200);
        assert.equal(me.body.user.role, 'onboarding');
        assert.equal(password.status, 200);
    });
});
