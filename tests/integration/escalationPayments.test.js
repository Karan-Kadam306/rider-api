const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const paymentWebhook = require('../../services/integrations/paymentWebhook');

before(async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'test-secret';
    process.env.ENABLE_MOCK_PAY = 'true';
    await h.startServer();
});
after(h.stopServer);
beforeEach(h.resetDb);

// YS-001 holds a bike and has an open ₹1,000 Charge on it.
async function seedCharge() {
    await h.createRider('YS-001');
    const bikeId = await h.createBike('VIN-1');
    await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');

    const res = await h.api('POST', '/api/riders/YS-001/escalations', { reasons: ['Bike Misuse'], amount: 1000 });
    const { escalationId, paymentLink } = res.body.escalation;

    return { bikeId, escalationId, token: paymentLink.split('/').at(-1) };
}

function sendWebhook(payload, signature) {
    const body = JSON.stringify(payload);

    return fetch(h.url('/api/webhooks/payment'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Payment-Signature': signature ?? paymentWebhook.sign(body)
        },
        body
    });
}

async function getEscalation(escalationId) {
    const { body } = await h.api('GET', '/api/riders/YS-001/escalations');
    return body.escalations.find(escalation => escalation.escalationId === escalationId);
}

describe('Payment webhook and mock pay', () => {
    it('swipe to pay marks the escalation Paid and unlocks the bike', async () => {
        const { escalationId, token } = await seedCharge();

        const page = await h.api('GET', `/api/mock-pay/${token}`, undefined, { Cookie: '' });
        assert.equal(page.status, 200);
        assert.equal(page.body.payment.amount, 1000);
        assert.equal(page.body.payment.payable, true);

        const swipe = await h.api('POST', `/api/mock-pay/${token}/swipe`, undefined, { Cookie: '' });
        assert.equal(swipe.status, 200);
        assert.equal(swipe.body.applied, true);

        const escalation = await getEscalation(escalationId);
        assert.equal(escalation.status, 'Paid');
        assert.equal(escalation.lockStatus, 'Unlocked');
        assert.match(escalation.paymentRef, /^MOCKPAY-/);
        assert.equal(escalation.paymentLink, null);
    });

    it('applies the same payment only once', async () => {
        const { token } = await seedCharge();
        const payment = { paymentId: 'PAY-1', token, amount: 1000 };

        const first = await (await sendWebhook(payment)).json();
        const second = await (await sendWebhook(payment)).json();

        assert.equal(first.applied, true);
        assert.equal(second.applied, false);
    });

    it('rejects a bad signature and a wrong amount', async () => {
        const { token } = await seedCharge();

        assert.equal((await sendWebhook({ paymentId: 'PAY-1', token, amount: 1000 }, 'abcd')).status, 401);
        assert.equal((await sendWebhook({ paymentId: 'PAY-1', token, amount: 10 })).status, 400);
    });

    it('a paid link can no longer be swiped', async () => {
        const { token } = await seedCharge();
        await h.api('POST', `/api/mock-pay/${token}/swipe`);

        const again = await h.api('POST', `/api/mock-pay/${token}/swipe`);

        assert.equal(again.status, 409);
    });
});

describe('Admin escalation actions', () => {
    it('marks paid with a reference', async () => {
        const { escalationId } = await seedCharge();

        const missing = await h.api('POST', `/api/escalations/${escalationId}/mark-paid`, {});
        const res = await h.api('POST', `/api/escalations/${escalationId}/mark-paid`, { reference: 'UPI-123' });

        assert.equal(missing.status, 400);
        assert.equal(res.status, 200);
        assert.equal(res.body.escalation.status, 'Paid');
        assert.equal(res.body.escalation.paymentRef, 'UPI-123');
        assert.equal(res.body.escalation.lockStatus, 'Unlocked');
    });

    it('waives with a reason, and refuses a second action', async () => {
        const { escalationId } = await seedCharge();

        const res = await h.api('POST', `/api/escalations/${escalationId}/waive`, { reason: 'First offence' });
        const again = await h.api('POST', `/api/escalations/${escalationId}/mark-paid`, { reference: 'UPI-1' });

        assert.equal(res.body.escalation.status, 'Waived');
        assert.equal(again.status, 409);
    });

    it('closes a Record but not a Charge', async () => {
        const { escalationId } = await seedCharge();
        const record = await h.api('POST', '/api/riders/YS-001/escalations', { reasons: ['Safety Concern'] });

        const closeRecord = await h.api('POST', `/api/escalations/${record.body.escalation.escalationId}/close`, { note: 'Spoke to rider' });
        const closeCharge = await h.api('POST', `/api/escalations/${escalationId}/close`, { note: 'x' });

        assert.equal(closeRecord.body.escalation.status, 'Closed');
        assert.equal(closeCharge.status, 409);
    });

    it('returning the bike releases its lock', async () => {
        const { bikeId, escalationId } = await seedCharge();

        const res = await h.api('POST', `/api/bikes/${bikeId}/return`);

        assert.equal(res.status, 200);
        assert.equal((await getEscalation(escalationId)).lockStatus, 'Unlocked');
    });
});
