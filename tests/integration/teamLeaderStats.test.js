const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

function getStats(from, to, headers) {
    return h.api('GET', `/api/analytics/team-leaders?from=${from}&to=${to}`, undefined, headers);
}

async function createTeamLeader(email, riderIds) {
    const userId = await h.createUser({ email, role: 'team_leader' });

    for (const riderId of riderIds) {
        await h.api('POST', `/api/riders/${riderId}/team-leaders`, { userId });
    }

    return { userId, cookie: { Cookie: await h.signIn(userId) } };
}

// A promise date must be in the future when logged, so an overdue one is written directly.
async function insertPromise(riderId, userId, promiseDate) {
    await h.pool.query(
        `INSERT INTO rider_follow_ups (rider_id, user_id, reason, outcome, note, promise_date)
         VALUES ($1, $2, 'Payment Due', 'Promised to Pay', 'Will pay', $3)`,
        [riderId, userId, promiseDate]
    );
}

describe('GET /api/analytics/team-leaders', () => {
    it('counts each team leader\'s calls, promises, recovered dues and riders owing', async () => {
        const today = h.todayInIst();
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        await h.createRider('YS-003');
        const tl = await createTeamLeader('tl@test.local', ['YS-001', 'YS-002']);
        await createTeamLeader('idle@test.local', ['YS-003']);

        // Calls: three follow-ups on two riders, two of them promises.
        await insertPromise('YS-001', tl.userId, h.addDays(today, -1));
        await insertPromise('YS-002', tl.userId, h.addDays(today, 5));
        await h.api('POST', '/api/riders/YS-002/follow-ups', { reason: 'Payment Due', outcome: 'Paid', note: 'Paid by UPI' }, tl.cookie);

        // Recovered: a charge on a held rider, marked paid.
        const charge = await h.api('POST', '/api/riders/YS-001/escalations', { reasons: ['Bike Misuse'], amount: 500 });
        await h.api('POST', `/api/escalations/${charge.body.escalation.escalationId}/mark-paid`, { reference: 'UPI-1' });

        // Owing now: YS-001's last payout was negative.
        await h.createPayoutItem('YS-001', h.addDays(h.currentWeekStart(), -7), -250);

        const res = await getStats(h.addDays(today, -6), today);
        const [idle, active] = res.body.teamLeaders;

        assert.equal(res.status, 200);
        assert.deepEqual(active, {
            userId: tl.userId,
            name: 'User tl@test.local',
            riders: 2,
            calls: 3,
            ridersCalled: 2,
            promises: { made: 2, kept: 1, broken: 1 },
            recovered: { count: 1, amount: 500 },
            owingNow: { count: 1, amount: 250 }
        });
        assert.equal(idle.riders, 1);
        assert.equal(idle.calls, 0);
        assert.deepEqual(idle.recovered, { count: 0, amount: 0 });
    });

    it('leaves out activity outside the dates', async () => {
        await h.createRider('YS-001');
        const tl = await createTeamLeader('tl@test.local', ['YS-001']);
        await h.api('POST', '/api/riders/YS-001/follow-ups', { reason: 'Performance', outcome: 'Will Improve', note: 'Ok' }, tl.cookie);

        const res = await getStats('2026-01-01', '2026-01-31');

        assert.equal(res.body.teamLeaders[0].calls, 0);
    });

    it('rejects bad dates', async () => {
        for (const [from, to] of [['2026-13-01', '2026-12-01'], ['2026-11-10', '2026-11-01'], ['2025-01-01', '2026-11-01'], ['', '']]) {
            const res = await getStats(from, to);
            assert.equal(res.status, 400, `${from} ${to}`);
        }
    });

    it('is open to staff but not to team leaders', async () => {
        const tl = await createTeamLeader('tl@test.local', []);
        const asStaff = { Cookie: await h.signIn(await h.createUser({ email: 'staff@test.local' })) };

        assert.equal((await getStats('2026-11-01', '2026-11-07', asStaff)).status, 200);
        assert.equal((await getStats('2026-11-01', '2026-11-07', tl.cookie)).status, 403);
    });
});
