const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

let tl;

async function riderOf(riderId, options) {
    await h.createRider(riderId, options);
    await h.api('POST', `/api/riders/${riderId}/team-leaders`, { userId: tl.userId });
}

function getQueue() {
    return h.api('GET', '/api/tl/queue', undefined, tl.cookie);
}

// Promise dates must be in the future when logged, so a broken promise is written directly.
async function insertPromise(riderId, promiseDate, promiseAmount = null) {
    await h.pool.query(
        `INSERT INTO rider_follow_ups (rider_id, user_id, reason, outcome, note, promise_date, promise_amount)
         VALUES ($1, $2, 'Payment Due', 'Promised to Pay', 'Will pay', $3, $4)`,
        [riderId, tl.userId, promiseDate, promiseAmount]
    );
}

const lastWeek = () => h.addDays(h.currentWeekStart(), -7);

beforeEach(async () => {
    const userId = await h.createUser({ email: 'tl@test.local', role: 'team_leader' });
    tl = { userId, cookie: { Cookie: await h.signIn(userId) } };
});

describe('GET /api/tl/queue', () => {
    it('lists only riders with a problem, worst first', async () => {
        await riderOf('YS-001');
        await riderOf('YS-002');
        await riderOf('YS-003');
        await h.createPayoutItem('YS-002', lastWeek(), -200);
        await h.api('POST', '/api/riders/YS-003/escalations', { reasons: ['Bike Misuse'], amount: 500 });

        const res = await getQueue();

        assert.equal(res.status, 200);
        assert.deepEqual(res.body.riders.map(rider => [rider.riderId, rider.severity]), [['YS-003', 'Critical'], ['YS-002', 'High']]);
        assert.equal(res.body.riders[1].reasons[0].type, 'negativePayout');
    });

    it('flags a broken promise only while the rider still owes', async () => {
        await riderOf('YS-001');
        await riderOf('YS-002');
        await h.createPayoutItem('YS-001', lastWeek(), -300);
        await insertPromise('YS-001', h.addDays(h.todayInIst(), -1), 300);
        await insertPromise('YS-002', h.addDays(h.todayInIst(), -1));

        const res = await getQueue();

        assert.deepEqual(res.body.riders.map(rider => rider.riderId), ['YS-001']);
        assert.deepEqual(res.body.riders[0].reasons.map(reason => reason.type), ['promiseBroken', 'negativePayout']);
        assert.equal(res.body.riders[0].severity, 'Critical');
    });

    it('drops a broken promise once a later follow-up says Paid', async () => {
        await riderOf('YS-001');
        await h.createPayoutItem('YS-001', lastWeek(), -300);
        await insertPromise('YS-001', h.addDays(h.todayInIst(), -1));
        await h.api('POST', '/api/riders/YS-001/follow-ups', { reason: 'Payment Due', outcome: 'Paid', note: 'Paid by UPI' });

        const res = await getQueue();

        assert.deepEqual(res.body.riders[0].reasons.map(reason => reason.type), ['negativePayout']);
    });

    it('shows a promise that is still due and marks a follow-up as due after 2 days', async () => {
        await riderOf('YS-001');
        await riderOf('YS-002');
        await h.createPayoutItem('YS-001', lastWeek(), -100);
        await h.createPayoutItem('YS-002', lastWeek(), -100);
        await h.api('POST', '/api/riders/YS-001/follow-ups', {
            reason: 'Payment Due', outcome: 'Promised to Pay', note: 'Friday', promiseDate: h.addDays(h.todayInIst(), 2)
        });

        const res = await getQueue();
        const [notCalled, called] = res.body.riders;

        // Same severity, so the rider nobody has called comes first.
        assert.equal(notCalled.riderId, 'YS-002');
        assert.equal(notCalled.followUpDue, true);
        assert.equal(called.followUpDue, false);
        assert.deepEqual(called.activePromise, { promiseDate: h.addDays(h.todayInIst(), 2), promiseAmount: null });
    });

    it('flags the lowest km riders on a bike, at most half of them', async () => {
        const yesterday = h.addDays(h.todayInIst(), -1);

        for (const [riderId, km] of [['YS-001', 10], ['YS-002', 80], ['YS-003', 90], ['YS-004', 5]]) {
            await riderOf(riderId);
            const bikeId = await h.createBike(`VIN-${riderId}`);
            await h.createAssignment(bikeId, riderId, '2026-10-01 09:00');
            await h.createKmRecord({ vin: `VIN-${riderId}`, bikeId, riderId, usageDate: yesterday, dailyKm: km, status: 'Validated' });
        }

        await riderOf('YS-005');

        const res = await getQueue();

        // Four riders on a bike: half is two. YS-005 has no bike, so it is not ranked.
        assert.deepEqual(res.body.riders.map(rider => [rider.riderId, rider.severity]), [['YS-001', 'Low'], ['YS-004', 'Low']]);
        assert.equal(res.body.riders[0].followUpDue, false);
    });

    it('drops a rider once their Payment Due is paid, before the next payout', async () => {
        await riderOf('YS-001');
        await h.createPayoutItem('YS-001', lastWeek(), -300);
        const collection = await h.api('POST', '/api/riders/YS-001/escalations', { reasons: ['Payment Due'] });

        const before = await getQueue();
        await h.api('POST', `/api/escalations/${collection.body.escalation.escalationId}/mark-paid`, { reference: 'UPI-1' });
        const after = await getQueue();
        const myRiders = await h.api('GET', '/api/tl/riders', undefined, tl.cookie);

        assert.equal(before.body.riders[0].severity, 'Critical');
        assert.deepEqual(after.body.riders, []);
        assert.equal(myRiders.body.riders[0].outstandingBalance, 0);
    });

    it('leaves riders on approved leave or new to their bike out of the low km ranking', async () => {
        const today = h.todayInIst();
        const yesterday = h.addDays(today, -1);

        for (const [riderId, km, assignedAt] of [
            ['YS-001', 10, '2026-10-01 09:00'],
            ['YS-002', 50, '2026-10-01 09:00'],
            ['YS-003', 0, '2026-10-01 09:00'],
            ['YS-004', 0, `${h.addDays(today, -2)} 09:00`]
        ]) {
            await riderOf(riderId);
            const bikeId = await h.createBike(`VIN-${riderId}`);
            await h.createAssignment(bikeId, riderId, assignedAt);
            await h.createKmRecord({ vin: `VIN-${riderId}`, bikeId, riderId, usageDate: yesterday, dailyKm: km, status: 'Validated' });
        }

        await h.pool.query(
            `INSERT INTO rider_inactive_periods (rider_id, start_date, end_date, approved) VALUES ('YS-003', $1, $2, true)`,
            [h.addDays(today, -5), h.addDays(today, -3)]
        );

        const res = await getQueue();

        // Only YS-001 and YS-002 can be compared fairly; half of two is one.
        assert.deepEqual(res.body.riders.map(rider => rider.riderId), ['YS-001']);
    });

    it('is empty for a team leader without riders, and not for other roles', async () => {
        const empty = await getQueue();
        const asAdmin = await h.api('GET', '/api/tl/queue');

        assert.deepEqual(empty.body.riders, []);
        assert.equal(asAdmin.status, 403);
    });
});

describe('Payment promise before locking a bike', () => {
    beforeEach(async () => {
        await riderOf('YS-001');
        await h.api('POST', '/api/riders/YS-001/follow-ups', {
            reason: 'Payment Due', outcome: 'Promised to Pay', note: 'Friday', promiseDate: h.addDays(h.todayInIst(), 3), promiseAmount: 400
        });
    });

    it('shows the active promise on the rider profile', async () => {
        const res = await h.api('GET', '/api/riders/YS-001/profile');

        assert.equal(res.body.activePromise.promiseDate, h.addDays(h.todayInIst(), 3));
        assert.equal(res.body.activePromise.promiseAmount, 400);
    });

    it('refuses a charge until the admin confirms, then records the override', async () => {
        const refused = await h.api('POST', '/api/riders/YS-001/escalations', { reasons: ['Bike Misuse'], amount: 500 });
        const confirmed = await h.api('POST', '/api/riders/YS-001/escalations', {
            reasons: ['Bike Misuse'], amount: 500, confirmPromiseOverride: true
        });

        assert.equal(refused.status, 409);
        assert.equal(refused.body.code, 'PROMISE_ACTIVE');
        assert.match(refused.body.error, /promise to pay/);
        assert.equal(confirmed.status, 201);
        assert.deepEqual(confirmed.body.escalation.events[0].detail.promiseOverridden, { promiseDate: h.addDays(h.todayInIst(), 3) });
    });

    it('does not block a Record, which never locks', async () => {
        const res = await h.api('POST', '/api/riders/YS-001/escalations', { reasons: ['Safety Concern'] });

        assert.equal(res.status, 201);
    });

    it('ends once the rider actually pays, even if nobody logs it', async () => {
        await h.createPayoutItem('YS-001', lastWeek(), -400);
        const collection = await h.api('POST', '/api/riders/YS-001/escalations', {
            reasons: ['Payment Due'], confirmPromiseOverride: true
        });
        await h.api('POST', `/api/escalations/${collection.body.escalation.escalationId}/mark-paid`, { reference: 'UPI-1' });

        const profile = await h.api('GET', '/api/riders/YS-001/profile');

        assert.equal(profile.body.activePromise, null);
    });

    it('stops applying once the rider refuses', async () => {
        await h.api('POST', '/api/riders/YS-001/follow-ups', { reason: 'Payment Due', outcome: 'Refused', note: 'Will not pay' });

        const profile = await h.api('GET', '/api/riders/YS-001/profile');
        const charge = await h.api('POST', '/api/riders/YS-001/escalations', { reasons: ['Bike Misuse'], amount: 500 });

        assert.equal(profile.body.activePromise, null);
        assert.equal(charge.status, 201);
    });
});
