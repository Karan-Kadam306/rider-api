const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

// resetDb signs in this admin as user 1.
const ADMIN_ID = 1;

async function createTeamLeader(email = 'tl@test.local') {
    const userId = await h.createUser({ email, role: 'team_leader' });
    return { userId, cookie: { Cookie: await h.signIn(userId) } };
}

function assign(riderId, userId) {
    return h.api('POST', `/api/riders/${riderId}/team-leaders`, { userId });
}

describe('Team leader users', () => {
    it('can be created with the team_leader role', async () => {
        const res = await h.api('POST', '/api/users', {
            email: 'lead@test.local',
            name: 'Lead',
            role: 'team_leader',
            password: 'a-long-password'
        });

        assert.equal(res.status, 201);
        assert.equal(res.body.user.role, 'team_leader');
    });

    it('are listed for admins with their rider counts', async () => {
        const { userId } = await createTeamLeader();
        await h.createRider('YS-001');
        await assign('YS-001', userId);

        const res = await h.api('GET', '/api/users/team-leaders');

        assert.equal(res.status, 200);
        assert.deepEqual(res.body.teamLeaders.map(tl => [tl.userId, tl.riderCount]), [[userId, 1]]);
    });

    it('lose their riders when their role changes', async () => {
        const { userId } = await createTeamLeader();
        await h.createRider('YS-001');
        await assign('YS-001', userId);

        await h.api('PATCH', `/api/users/${userId}`, { role: 'staff' });
        const res = await h.api('GET', '/api/riders/YS-001/team-leaders');

        assert.deepEqual(res.body.teamLeaders, []);
    });
});

describe('Assigning team leaders', () => {
    it('lets a rider have several team leaders', async () => {
        const first = await createTeamLeader('tl1@test.local');
        const second = await createTeamLeader('tl2@test.local');
        await h.createRider('YS-001');

        assert.equal((await assign('YS-001', first.userId)).status, 201);
        const res = await assign('YS-001', second.userId);

        assert.equal(res.status, 201);
        assert.deepEqual(res.body.teamLeaders.map(tl => tl.userId), [first.userId, second.userId]);
    });

    it('refuses the same team leader twice', async () => {
        const { userId } = await createTeamLeader();
        await h.createRider('YS-001');
        await assign('YS-001', userId);

        const res = await assign('YS-001', userId);

        assert.equal(res.status, 409);
    });

    it('refuses a user who is not an active team leader', async () => {
        const staffId = await h.createUser({ email: 'staff@test.local' });
        const inactiveId = await h.createUser({ email: 'old@test.local', role: 'team_leader', isActive: false });
        await h.createRider('YS-001');

        assert.equal((await assign('YS-001', staffId)).status, 400);
        assert.equal((await assign('YS-001', inactiveId)).status, 400);
        assert.equal((await assign('YS-001', 'abc')).status, 400);
    });

    it('refuses a terminated rider and an unknown rider', async () => {
        const { userId } = await createTeamLeader();
        await h.createRider('YS-001', { status: 'Terminated', terminatedOn: '2026-10-01' });

        assert.equal((await assign('YS-001', userId)).status, 409);
        assert.equal((await assign('NOPE', userId)).status, 404);
    });

    it('removes a team leader and keeps the row as history', async () => {
        const { userId } = await createTeamLeader();
        await h.createRider('YS-001');
        await assign('YS-001', userId);

        const res = await h.api('DELETE', `/api/riders/YS-001/team-leaders/${userId}`);
        const again = await h.api('DELETE', `/api/riders/YS-001/team-leaders/${userId}`);
        const history = await h.pool.query('SELECT removed_by::int AS removed_by FROM team_leader_riders');

        assert.equal(res.status, 200);
        assert.deepEqual(res.body.teamLeaders, []);
        assert.equal(again.status, 404);
        assert.deepEqual(history.rows, [{ removed_by: ADMIN_ID }]);
    });

    it('is for admins only; staff can still see who leads a rider', async () => {
        const { userId } = await createTeamLeader();
        await h.createRider('YS-001');
        await assign('YS-001', userId);
        const asStaff = { Cookie: await h.signIn(await h.createUser({ email: 'staff@test.local' })) };

        const list = await h.api('GET', '/api/riders/YS-001/team-leaders', undefined, asStaff);
        const add = await h.api('POST', '/api/riders/YS-001/team-leaders', { userId }, asStaff);
        const remove = await h.api('DELETE', `/api/riders/YS-001/team-leaders/${userId}`, undefined, asStaff);
        const leaders = await h.api('GET', '/api/users/team-leaders', undefined, asStaff);

        assert.equal(list.status, 200);
        assert.equal(list.body.teamLeaders.length, 1);
        assert.equal(add.status, 403);
        assert.equal(remove.status, 403);
        assert.equal(leaders.status, 403);
    });
});

describe('GET /api/tl/riders', () => {
    it('lists only the team leader\'s own riders, owing riders first', async () => {
        const tl = await createTeamLeader();
        const other = await createTeamLeader('other@test.local');
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        await h.createRider('YS-003');
        await assign('YS-001', tl.userId);
        await assign('YS-002', tl.userId);
        await assign('YS-003', other.userId);
        await h.createPayoutItem('YS-002', h.addDays(h.currentWeekStart(), -7), -150);
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');

        const res = await h.api('GET', '/api/tl/riders', undefined, tl.cookie);

        assert.equal(res.status, 200);
        assert.deepEqual(res.body.riders.map(rider => rider.riderId), ['YS-002', 'YS-001']);
        assert.equal(res.body.riders[0].lastNetPayout, -150);
        assert.equal(res.body.riders[1].currentBike.chassisNumber, 'VIN-1');
        assert.equal(res.body.pagination.totalRecords, 2);
    });

    it('searches by rider ID', async () => {
        const tl = await createTeamLeader();
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        await assign('YS-001', tl.userId);
        await assign('YS-002', tl.userId);

        const res = await h.api('GET', '/api/tl/riders?search=002', undefined, tl.cookie);

        assert.deepEqual(res.body.riders.map(rider => rider.riderId), ['YS-002']);
    });

    it('is for team leaders only', async () => {
        const res = await h.api('GET', '/api/tl/riders');

        assert.equal(res.status, 403);
    });
});

describe('Team leader access', () => {
    it('opens their own rider\'s profile, payouts, history and escalations', async () => {
        const tl = await createTeamLeader();
        await h.createRider('YS-001');
        await assign('YS-001', tl.userId);

        for (const section of ['profile', 'payouts', 'assignments', 'escalations']) {
            const res = await h.api('GET', `/api/riders/YS-001/${section}`, undefined, tl.cookie);
            assert.equal(res.status, 200, section);
        }
    });

    it('gets 404 for a rider who is not theirs, or no longer theirs', async () => {
        const tl = await createTeamLeader();
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        await assign('YS-002', tl.userId);
        await h.api('DELETE', `/api/riders/YS-002/team-leaders/${tl.userId}`);

        const notTheirs = await h.api('GET', '/api/riders/YS-001/profile', undefined, tl.cookie);
        const removed = await h.api('GET', '/api/riders/YS-002/profile', undefined, tl.cookie);
        const unknown = await h.api('GET', '/api/riders/NOPE/profile', undefined, tl.cookie);

        assert.equal(notTheirs.status, 404);
        assert.equal(removed.status, 404);
        assert.equal(unknown.status, 404);
    });

    it('is refused everywhere else, even for their own rider', async () => {
        const tl = await createTeamLeader();
        await h.createRider('YS-001');
        await assign('YS-001', tl.userId);
        const week = h.currentWeekStart();

        for (const [method, path] of [
            ['GET', '/api/riders'],
            ['GET', '/api/riders/summary'],
            ['GET', '/api/riders/YS-001'],
            ['PUT', '/api/riders/YS-001'],
            ['DELETE', '/api/riders/YS-001'],
            ['GET', '/api/riders/YS-001/team-leaders'],
            ['POST', '/api/riders/YS-001/team-leaders'],
            ['GET', '/api/riders/YS-001/inactive-periods'],
            ['POST', '/api/riders/YS-001/inactive-periods'],
            ['GET', '/api/bikes'],
            ['GET', '/api/daily-km'],
            ['GET', `/api/billing/summary?weekStart=${week}`],
            ['GET', `/api/dashboard?weekStart=${week}`],
            ['GET', '/api/payouts/recent'],
            ['GET', '/api/imports'],
            ['GET', '/api/partners'],
            ['GET', '/api/partner-earnings/pending'],
            ['GET', '/api/users'],
            ['POST', '/api/tl/riders']
        ]) {
            const res = await h.api(method, path, method === 'GET' ? undefined : {}, tl.cookie);
            assert.equal(res.status, 403, `${method} ${path}`);
        }
    });

    it('can still check and end their own session', async () => {
        const tl = await createTeamLeader();

        const me = await h.api('GET', '/api/auth/me', undefined, tl.cookie);
        const logout = await h.api('POST', '/api/auth/logout', undefined, tl.cookie);

        assert.equal(me.status, 200);
        assert.equal(me.body.user.role, 'team_leader');
        assert.equal(logout.status, 200);
    });
});
