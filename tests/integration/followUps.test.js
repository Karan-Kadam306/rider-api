const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

async function createTeamLeader(email = 'tl@test.local') {
    const userId = await h.createUser({ email, role: 'team_leader' });
    return { userId, cookie: { Cookie: await h.signIn(userId) } };
}

function assign(riderId, userId) {
    return h.api('POST', `/api/riders/${riderId}/team-leaders`, { userId });
}

function logFollowUp(riderId, body, headers) {
    return h.api('POST', `/api/riders/${riderId}/follow-ups`, body, headers);
}

const CALL = { reason: 'Performance', outcome: 'Will Improve', note: 'Says he will ride more next week' };

describe('POST /api/riders/:riderId/follow-ups', () => {
    it('logs what the rider said, with who logged it', async () => {
        await h.createRider('YS-001');

        const res = await logFollowUp('YS-001', { ...CALL, note: '  Says he will ride more  ' });

        assert.equal(res.status, 201);
        assert.equal(res.body.followUp.note, 'Says he will ride more');
        assert.equal(res.body.followUp.promiseDate, null);
        assert.deepEqual(res.body.followUp.loggedBy, { userId: 1, name: 'User admin@test.local', role: 'admin' });
    });

    it('records a payment promise from today up to 30 days ahead', async () => {
        await h.createRider('YS-001');
        const promise = { reason: 'Payment Due', outcome: 'Promised to Pay', note: 'Will pay on Friday' };
        const today = h.todayInIst();

        const withAmount = await logFollowUp('YS-001', { ...promise, promiseDate: h.addDays(today, 3), promiseAmount: 450.5 });
        const withoutAmount = await logFollowUp('YS-001', { ...promise, promiseDate: today });

        assert.equal(withAmount.status, 201);
        assert.equal(withAmount.body.followUp.promiseDate, h.addDays(today, 3));
        assert.equal(withAmount.body.followUp.promiseAmount, 450.5);
        assert.equal(withoutAmount.status, 201);
        assert.equal(withoutAmount.body.followUp.promiseAmount, null);
    });

    it('refuses a promise without a sensible date or amount', async () => {
        await h.createRider('YS-001');
        const promise = { reason: 'Payment Due', outcome: 'Promised to Pay', note: 'Will pay' };
        const today = h.todayInIst();

        for (const extra of [
            {},
            { promiseDate: h.addDays(today, -1) },
            { promiseDate: h.addDays(today, 31) },
            { promiseDate: '2026-02-30' },
            { promiseDate: '2026-13-01' },
            { promiseDate: today, promiseAmount: 0 },
            { promiseDate: today, promiseAmount: 10.123 }
        ]) {
            const res = await logFollowUp('YS-001', { ...promise, ...extra });
            assert.equal(res.status, 400, JSON.stringify(extra));
        }
    });

    it('refuses bad input', async () => {
        await h.createRider('YS-001');

        for (const body of [
            { ...CALL, reason: 'Gossip' },
            { ...CALL, outcome: 'Maybe' },
            { ...CALL, note: '   ' },
            { ...CALL, note: 'x'.repeat(1001) },
            { ...CALL, promiseDate: h.todayInIst() },
            { ...CALL, escalationId: 'one' }
        ]) {
            const res = await logFollowUp('YS-001', body);
            assert.equal(res.status, 400, JSON.stringify(body));
        }
    });

    it('links an escalation only when it belongs to the rider', async () => {
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        const own = await h.api('POST', '/api/riders/YS-001/escalations', { reasons: ['Safety Concern'] });
        const other = await h.api('POST', '/api/riders/YS-002/escalations', { reasons: ['Safety Concern'] });

        const linked = await logFollowUp('YS-001', { ...CALL, escalationId: own.body.escalation.escalationId });
        const wrong = await logFollowUp('YS-001', { ...CALL, escalationId: other.body.escalation.escalationId });

        assert.equal(linked.status, 201);
        assert.equal(linked.body.followUp.escalationId, own.body.escalation.escalationId);
        assert.equal(wrong.status, 400);
    });

    it('returns 404 for an unknown rider', async () => {
        const res = await logFollowUp('NOPE', CALL);

        assert.equal(res.status, 404);
    });

    it('cannot be changed or deleted afterwards', async () => {
        await h.createRider('YS-001');
        await logFollowUp('YS-001', CALL);

        await assert.rejects(h.pool.query("UPDATE rider_follow_ups SET note = 'changed'"), /cannot be changed or deleted/);
        await assert.rejects(h.pool.query('DELETE FROM rider_follow_ups'), /cannot be changed or deleted/);
    });
});

describe('GET /api/riders/:riderId/follow-ups', () => {
    it('lists the rider\'s follow-ups newest first, paginated', async () => {
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        await logFollowUp('YS-001', { ...CALL, note: 'first' });
        await logFollowUp('YS-001', { ...CALL, note: 'second' });
        await logFollowUp('YS-002', { ...CALL, note: 'other rider' });

        const res = await h.api('GET', '/api/riders/YS-001/follow-ups?limit=1');

        assert.equal(res.status, 200);
        assert.deepEqual(res.body.followUps.map(followUp => followUp.note), ['second']);
        assert.equal(res.body.pagination.totalRecords, 2);
    });
});

describe('Team leader follow-ups and escalations', () => {
    it('logs and reads follow-ups for their own rider only', async () => {
        const tl = await createTeamLeader();
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        await assign('YS-001', tl.userId);

        const logged = await logFollowUp('YS-001', CALL, tl.cookie);
        const list = await h.api('GET', '/api/riders/YS-001/follow-ups', undefined, tl.cookie);
        const notTheirs = await logFollowUp('YS-002', CALL, tl.cookie);
        const notTheirsList = await h.api('GET', '/api/riders/YS-002/follow-ups', undefined, tl.cookie);

        assert.equal(logged.status, 201);
        assert.equal(logged.body.followUp.loggedBy.role, 'team_leader');
        assert.equal(list.body.followUps.length, 1);
        assert.equal(notTheirs.status, 404);
        assert.equal(notTheirsList.status, 404);
    });

    it('lets a team leader raise a Record for their own rider', async () => {
        const tl = await createTeamLeader();
        await h.createRider('YS-001');
        await assign('YS-001', tl.userId);

        const res = await h.api('POST', '/api/riders/YS-001/escalations', { reasons: ['Attendance Issues'], comment: 'Missed 3 days' }, tl.cookie);

        assert.equal(res.status, 201);
        assert.equal(res.body.escalation.kind, 'Record');
        assert.equal(res.body.escalation.lockStatus, null);
    });

    it('refuses a team leader a charge, Payment Due, or someone else\'s rider', async () => {
        const tl = await createTeamLeader();
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        await assign('YS-001', tl.userId);
        await h.createPayoutItem('YS-001', h.addDays(h.currentWeekStart(), -7), -200);

        const charge = await h.api('POST', '/api/riders/YS-001/escalations', { reasons: ['Bike Misuse'], amount: 500 }, tl.cookie);
        const paymentDue = await h.api('POST', '/api/riders/YS-001/escalations', { reasons: ['Payment Due'] }, tl.cookie);
        const otherRider = await h.api('POST', '/api/riders/YS-002/escalations', { reasons: ['Safety Concern'] }, tl.cookie);
        const count = await h.pool.query('SELECT COUNT(*)::int AS total FROM rider_escalations');

        assert.equal(charge.status, 403);
        assert.equal(paymentDue.status, 403);
        assert.equal(otherRider.status, 404);
        assert.equal(count.rows[0].total, 0);
    });

    it('still refuses staff any escalation', async () => {
        await h.createRider('YS-001');
        const asStaff = { Cookie: await h.signIn(await h.createUser({ email: 'staff@test.local' })) };

        const res = await h.api('POST', '/api/riders/YS-001/escalations', { reasons: ['Safety Concern'] }, asStaff);

        assert.equal(res.status, 403);
    });
});
