const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'test-secret';
    process.env.ENABLE_MOCK_PAY = 'true';
    await h.startServer();
});
after(h.stopServer);
beforeEach(h.resetDb);

const lastWeek = () => h.addDays(h.currentWeekStart(), -7);

// YS-001 rides all of last week with no earnings, so the payout leaves them at −₹413 (7 days of rental).
// The bike is assigned on last week's Monday, so no earlier week is left unpaid.
async function seedNegativeRider(riderId = 'YS-001') {
    await h.createRider(riderId);
    const bikeId = await h.createBike(`VIN-${riderId}`);
    await h.createAssignment(bikeId, riderId, `${lastWeek()} 09:00`);
    return bikeId;
}

async function createTeamLeader(riderIds) {
    const userId = await h.createUser({ email: 'tl@test.local', role: 'team_leader' });

    for (const riderId of riderIds) {
        await h.api('POST', `/api/riders/${riderId}/team-leaders`, { userId });
    }

    return { userId, cookie: { Cookie: await h.signIn(userId) } };
}

function runPayout(weekStart = lastWeek()) {
    return h.api('POST', `/api/payouts/weeks/${weekStart}/run`);
}

async function openEscalation(riderId = 'YS-001') {
    const { body } = await h.api('GET', `/api/riders/${riderId}/escalations`);
    return body.escalations.find(escalation => escalation.status === 'Open');
}

describe('Payment Due after a payout run', () => {
    it('sends the payment link and locks the bike for every rider left negative', async () => {
        await seedNegativeRider();

        const res = await runPayout();
        const escalation = await openEscalation();

        assert.equal(res.status, 201);
        assert.deepEqual(res.body.collections, { raised: [{ riderId: 'YS-001', amount: 413, lockStatus: 'Locked' }], failed: [] });
        assert.equal(escalation.kind, 'Collection');
        assert.equal(escalation.amount, 413);
        assert.ok(escalation.paymentLink);
        assert.deepEqual(escalation.events[0].detail, { amount: 413, automatic: { weekStart: lastWeek() } });
    });

    it('sends the link but skips the lock while a payment promise is due; Lock now locks it later', async () => {
        await seedNegativeRider();
        await h.api('POST', '/api/riders/YS-001/follow-ups', {
            reason: 'Payment Due', outcome: 'Promised to Pay', note: 'Friday', promiseDate: h.addDays(h.todayInIst(), 2)
        });

        const res = await runPayout();
        const skipped = await openEscalation();
        const locked = await h.api('POST', `/api/escalations/${skipped.escalationId}/retry-lock`);

        assert.equal(res.body.collections.raised[0].lockStatus, 'Skipped');
        assert.equal(skipped.events.at(-1).eventType, 'LockSkipped');
        assert.match(skipped.events.at(-1).detail.reason, /Payment promise due/);
        assert.equal(locked.status, 200);
        assert.equal(locked.body.escalation.lockStatus, 'Locked');
    });

    it('will not lock a skipped bike the rider has since returned', async () => {
        const bikeId = await seedNegativeRider();
        await h.api('POST', '/api/riders/YS-001/follow-ups', {
            reason: 'Payment Due', outcome: 'Promised to Pay', note: 'Friday', promiseDate: h.addDays(h.todayInIst(), 2)
        });
        await runPayout();
        await h.api('POST', `/api/bikes/${bikeId}/return`);

        const res = await h.api('POST', `/api/escalations/${(await openEscalation()).escalationId}/retry-lock`);

        assert.equal(res.status, 409);
        assert.match(res.body.error, /no longer holds that bike/);
    });

    it('skips riders who already have an open charge, and a second run adds nothing', async () => {
        await seedNegativeRider('YS-001');
        await seedNegativeRider('YS-002');
        await h.api('POST', '/api/riders/YS-002/escalations', { reasons: ['Bike Misuse'], amount: 100 });

        const first = await runPayout();
        const count = await h.pool.query("SELECT COUNT(*)::int AS total FROM rider_escalations WHERE kind = 'Collection'");

        assert.deepEqual(first.body.collections.raised.map(item => item.riderId), ['YS-001']);
        assert.equal(count.rows[0].total, 1);
    });

    it('raises nothing for an older week paid late', async () => {
        const week = h.addDays(h.currentWeekStart(), -14);
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', `${week} 09:00`, `${h.addDays(week, 6)} 18:00`);

        const res = await runPayout(week);

        assert.equal(res.status, 201);
        assert.deepEqual(res.body.collections, { raised: [], failed: [] });
    });

    it('takes the rider out of the team leader\'s queue once paid through the link', async () => {
        await seedNegativeRider();
        const tl = await createTeamLeader(['YS-001']);
        await runPayout();

        const before = await h.api('GET', '/api/tl/queue', undefined, tl.cookie);
        const token = (await openEscalation()).paymentLink.split('/').at(-1);
        const swipe = await h.api('POST', `/api/mock-pay/${token}/swipe`, undefined, { Cookie: '' });
        const after = await h.api('GET', '/api/tl/queue', undefined, tl.cookie);

        assert.equal(before.body.riders[0].severity, 'Critical');
        assert.equal(swipe.body.applied, true);
        assert.deepEqual(after.body.riders, []);
    });
});

describe('A follow-up saying the rider paid', () => {
    it('does not clear the due: the queue and the rider page wait for an admin', async () => {
        await seedNegativeRider();
        const tl = await createTeamLeader(['YS-001']);
        await runPayout();
        await h.api('POST', '/api/riders/YS-001/follow-ups', { reason: 'Payment Due', outcome: 'Paid', note: 'Paid cash at the hub' }, tl.cookie);

        const queue = await h.api('GET', '/api/tl/queue', undefined, tl.cookie);
        const profile = await h.api('GET', '/api/riders/YS-001/profile');

        assert.equal(queue.body.riders[0].reasons[0].type, 'saysPaid');
        assert.match(queue.body.riders[0].reasons[0].label, /waiting for an admin to confirm/);
        assert.equal(queue.body.riders[0].followUpDue, false);
        assert.equal(profile.body.paymentClaim.note, 'Paid cash at the hub');
        assert.equal(profile.body.paymentClaim.loggedBy, 'User tl@test.local');
    });

    it('is cleared once an admin marks the payment as paid', async () => {
        await seedNegativeRider();
        const tl = await createTeamLeader(['YS-001']);
        await runPayout();
        await h.api('POST', '/api/riders/YS-001/follow-ups', { reason: 'Payment Due', outcome: 'Paid', note: 'Paid cash' }, tl.cookie);

        await h.api('POST', `/api/escalations/${(await openEscalation()).escalationId}/mark-paid`, { reference: 'CASH-1' });
        const queue = await h.api('GET', '/api/tl/queue', undefined, tl.cookie);
        const profile = await h.api('GET', '/api/riders/YS-001/profile');

        assert.deepEqual(queue.body.riders, []);
        assert.equal(profile.body.paymentClaim, null);
    });
});
