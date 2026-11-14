const h = require('../helpers');
const { describe, it, before, beforeEach, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);
afterEach(() => {
    delete process.env.MOCK_IOT_FAIL;
});

function raise(riderId, body, headers) {
    return h.api('POST', `/api/riders/${riderId}/escalations`, body, headers);
}

// YS-001 holds a bike.
async function seedRiderWithBike() {
    await h.createRider('YS-001');
    const bikeId = await h.createBike('VIN-1');
    await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');
    return bikeId;
}

describe('Raising escalations', () => {
    it('raises a Charge that locks the bike and sends a payment link', async () => {
        const bikeId = await seedRiderWithBike();

        const res = await raise('YS-001', { reasons: ['Bike Misuse'], amount: 1000, comment: 'Broken mirror' });

        assert.equal(res.status, 201);
        const { escalation } = res.body;
        assert.equal(escalation.kind, 'Charge');
        assert.equal(escalation.amount, 1000);
        assert.equal(escalation.status, 'Open');
        assert.equal(escalation.lockStatus, 'Locked');
        assert.equal(escalation.bikeId, String(bikeId));
        assert.equal(escalation.weekStart, h.currentWeekStart());
        assert.match(escalation.paymentLink, /\/mock-pay\/[0-9a-f]{64}$/);
        assert.deepEqual(escalation.events.map(event => event.eventType), ['Raised', 'LinkSent', 'BikeLocked']);
    });

    it('raises a Record without an amount: no lock and no link', async () => {
        await seedRiderWithBike();

        const res = await raise('YS-001', { reasons: ['Safety Concern'] });

        assert.equal(res.status, 201);
        assert.equal(res.body.escalation.kind, 'Record');
        assert.equal(res.body.escalation.amount, null);
        assert.equal(res.body.escalation.lockStatus, null);
        assert.equal(res.body.escalation.paymentLink, null);
    });

    it('sets the Payment Due amount from the outstanding balance', async () => {
        await h.createRider('YS-001');
        await h.createPayoutItem('YS-001', h.addDays(h.currentWeekStart(), -7), -500);

        const res = await raise('YS-001', { reasons: ['Payment Due'], amount: 1 });

        assert.equal(res.status, 201);
        assert.equal(res.body.escalation.kind, 'Collection');
        assert.equal(res.body.escalation.amount, 500);
        assert.equal(res.body.escalation.lockStatus, 'NoBike');
    });

    it('rejects Payment Due when nothing is owed', async () => {
        await h.createRider('YS-001');

        const res = await raise('YS-001', { reasons: ['Payment Due'] });

        assert.equal(res.status, 400);
    });

    it('validates reasons, comment and amount', async () => {
        await h.createRider('YS-001');

        for (const body of [
            { reasons: [] },
            { reasons: ['Late'] },
            { reasons: ['Other'] },
            { reasons: ['Bike Misuse'], amount: 0 },
            { reasons: ['Bike Misuse'], amount: 10.555 }
        ]) {
            const res = await raise('YS-001', body);
            assert.equal(res.status, 400, JSON.stringify(body));
        }
    });

    it('allows one open Charge or Collection per rider, but Records alongside it', async () => {
        await seedRiderWithBike();
        await raise('YS-001', { reasons: ['Bike Misuse'], amount: 1000 });

        const second = await raise('YS-001', { reasons: ['SOP Violation'], amount: 200 });
        const record = await raise('YS-001', { reasons: ['Attendance Issues'] });

        assert.equal(second.status, 409);
        assert.equal(record.status, 201);
    });

    it('keeps the escalation open with a Failed lock, and retries it', async () => {
        await seedRiderWithBike();
        process.env.MOCK_IOT_FAIL = 'true';

        const res = await raise('YS-001', { reasons: ['Bike Misuse'], amount: 1000 });
        assert.equal(res.body.escalation.lockStatus, 'Failed');

        delete process.env.MOCK_IOT_FAIL;
        const retry = await h.api('POST', `/api/escalations/${res.body.escalation.escalationId}/retry-lock`);

        assert.equal(retry.status, 200);
        assert.equal(retry.body.escalation.lockStatus, 'Locked');
    });

    it('rejects a terminated rider, an unknown rider and staff', async () => {
        await h.createRider('YS-001', { status: 'Terminated', terminatedOn: '2026-10-01' });
        await h.createRider('YS-002');
        const asStaff = { Cookie: await h.signIn(await h.createUser({ email: 'staff@test.local' })) };

        assert.equal((await raise('YS-001', { reasons: ['Safety Concern'] })).status, 409);
        assert.equal((await raise('NOPE', { reasons: ['Safety Concern'] })).status, 404);
        assert.equal((await raise('YS-002', { reasons: ['Safety Concern'] }, asStaff)).status, 403);
    });

    it('lists escalations and shows the open ones on the profile', async () => {
        await seedRiderWithBike();
        await raise('YS-001', { reasons: ['Bike Misuse'], amount: 1000 });

        const list = await h.api('GET', '/api/riders/YS-001/escalations');
        const profile = await h.api('GET', '/api/riders/YS-001/profile');

        assert.equal(list.body.count, 1);
        assert.equal(profile.body.openEscalations.length, 1);
    });
});
