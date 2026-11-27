const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const paymentWebhook = require('../../services/integrations/paymentWebhook');
const { signUp, completeSteps, put, submit } = require('../onboardingFlow');

before(async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'test-secret';
    process.env.ENABLE_MOCK_PAY = 'true';
    await h.startServer();
});
after(h.stopServer);

let packId;

beforeEach(async () => {
    await h.resetDb();
    await h.pool.query(`INSERT INTO deposit_amounts (amount, effective_from) VALUES (2000, '2000-01-01')`);
    const { rows } = await h.pool.query(
        `INSERT INTO prepaid_packs (kind, name, price, km_included, validity_days)
         VALUES ('Weekly', '400 KM Week', 1000, 400, 7)
         RETURNING pack_id::int AS pack_id`
    );
    packId = rows[0].pack_id;
});

const ITEMS = ['aadhaar', 'pan', 'dl', 'address_proof', 'selfie', 'bank'];
const appBase = applicationId => `/api/onboarding/applications/${applicationId}`;
let keyCounter = 0;

// A submitted, fully verified and approved application: the rider now owes the payments.
async function approvedApplication({ planType = 'Postpaid' } = {}) {
    const token = await signUp();
    await completeSteps(token, {
        overrides: planType === 'Prepaid' ? { plan: t => put(t, 'plan', { planType: 'Prepaid', packId }) } : {}
    });
    const { body: { applicationNo } } = await submit(token);
    const { rows: [{ application_id: applicationId }] } = await h.pool.query(
        'SELECT application_id::int AS application_id FROM rider_applications WHERE application_no = $1',
        [applicationNo]
    );

    for (const item of ITEMS) {
        await h.api('PATCH', `${appBase(applicationId)}/items/${item}`, { status: 'Verified' });
    }

    const approved = await h.api('POST', `${appBase(applicationId)}/approve`, { hubId: h.getDefaultHubId() });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));

    return { token, applicationId, riderId: approved.body.application.riderId };
}

function createOrder(token, purpose = 'Deposit', key = `key-${++keyCounter}-abcdef`, extra = {}) {
    return h.riderApi('POST', '/api/rider-app/payments/orders', { purpose, ...extra }, token, key ? { 'Idempotency-Key': key } : {});
}

function sendWebhook(payload, signature) {
    const body = JSON.stringify(payload);

    return fetch(h.url('/api/webhooks/payment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Payment-Signature': signature ?? paymentWebhook.sign(body) },
        body
    }).then(async res => ({ status: res.status, body: await res.json() }));
}

function captured(order, paymentId = `PAY-${order.orderId}`) {
    return sendWebhook({ event: 'payment.captured', paymentId, orderId: order.orderId, amount: order.amount });
}

async function applicationStatus(applicationId) {
    const { rows: [row] } = await h.pool.query('SELECT status FROM rider_applications WHERE application_id = $1', [applicationId]);
    return row.status;
}

describe('Starting a payment', () => {
    it('charges the deposit in effect today, set by the server, not the app', async () => {
        const { token } = await approvedApplication();
        await h.pool.query(`INSERT INTO deposit_amounts (amount, effective_from) VALUES (2500, CURRENT_DATE)`);

        const due = await h.riderApi('GET', '/api/rider-app/payments', undefined, token);
        const res = await createOrder(token, 'Deposit', undefined, { amount: 1 });

        assert.equal(due.status, 200);
        assert.deepEqual(due.body.payments.map(item => [item.purpose, item.status, item.amount]), [['Deposit', 'Due', 2500]]);
        assert.equal(due.body.nextDue, 'Deposit');
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.match(res.body.order.orderId, /^ORD-[0-9A-F]{20}$/);
        assert.equal(res.body.order.amount, 2500);
        assert.equal(res.body.order.status, 'Created');
    });

    it('returns the same order for a repeated key or a second tap, and needs a key', async () => {
        const { token } = await approvedApplication();

        const first = await createOrder(token, 'Deposit', 'same-key-123');
        const repeat = await createOrder(token, 'Deposit', 'same-key-123');
        const secondTap = await createOrder(token, 'Deposit', 'other-key-456');
        const noKey = await createOrder(token, 'Deposit', null);
        const { rows: [{ count }] } = await h.pool.query('SELECT count(*)::int AS count FROM rider_payments');

        assert.equal(repeat.body.order.orderId, first.body.order.orderId);
        assert.equal(secondTap.body.order.orderId, first.body.order.orderId);
        assert.equal(noKey.status, 400);
        assert.equal(count, 1);
    });

    it('only works while payment is pending, and a postpaid plan has no pack', async () => {
        const token = await signUp();
        const { token: approvedToken } = await approvedApplication();

        assert.equal((await createOrder(token)).status, 409);
        assert.equal((await createOrder(approvedToken, 'PrepaidPack')).status, 409);
        assert.equal((await createOrder(approvedToken, 'Nope')).status, 400);
    });

    it('starts a new order once the open one has expired', async () => {
        const { token } = await approvedApplication();
        const first = await createOrder(token);
        await h.pool.query(`UPDATE rider_payments SET expires_at = now() - interval '1 minute'`);

        const order = await h.riderApi('GET', `/api/rider-app/payments/orders/${first.body.order.orderId}`, undefined, token);
        const second = await createOrder(token);

        assert.equal(order.body.order.status, 'Expired');
        assert.notEqual(second.body.order.orderId, first.body.order.orderId);
    });
});

describe('Payment webhook', () => {
    it('marks the deposit paid, holds the deposit and moves a postpaid rider to the Bike tab', async () => {
        const { token, applicationId, riderId } = await approvedApplication();
        const { body: { order } } = await createOrder(token);

        const res = await captured(order);

        assert.deepEqual(res, { status: 200, body: { applied: true } });
        assert.equal(await applicationStatus(applicationId), 'Bike Pending');

        const { rows: [deposit] } = await h.pool.query('SELECT amount::float8 AS amount, status FROM rider_deposits WHERE rider_id = $1', [riderId]);
        assert.deepEqual(deposit, { amount: 2000, status: 'Held' });

        const check = await h.riderApi('GET', `/api/rider-app/payments/orders/${order.orderId}`, undefined, token);
        assert.equal(check.body.order.status, 'Paid');
        assert.equal(check.body.order.method, 'Gateway');

        const { body: { application } } = await h.api('GET', appBase(applicationId));
        assert.equal(application.payments.deposit.status, 'Held');
        assert.deepEqual(application.timeline.slice(-2).map(event => event.event), ['payment_started', 'deposit_paid']);
        assert.equal(application.timeline.at(-1).toStatus, 'Bike Pending');
    });

    it('needs the deposit before the pack, and both before the Bike tab for a prepaid rider', async () => {
        const { token, applicationId } = await approvedApplication({ planType: 'Prepaid' });

        const packFirst = await createOrder(token, 'PrepaidPack');
        const deposit = (await createOrder(token, 'Deposit')).body.order;
        await captured(deposit);
        const afterDeposit = await applicationStatus(applicationId);
        const due = await h.riderApi('GET', '/api/rider-app/payments', undefined, token);
        const pack = (await createOrder(token, 'PrepaidPack')).body.order;
        await captured(pack);

        assert.equal(packFirst.status, 409);
        assert.equal(packFirst.body.error, 'Pay the deposit first');
        assert.equal(afterDeposit, 'Payment Pending');
        assert.equal(due.body.nextDue, 'PrepaidPack');
        assert.equal(pack.amount, 1000);
        assert.equal(await applicationStatus(applicationId), 'Bike Pending');
    });

    it('applies a repeated webhook only once', async () => {
        const { token, riderId } = await approvedApplication();
        const { body: { order } } = await createOrder(token);

        await captured(order, 'PAY-1');
        const again = await captured(order, 'PAY-1');
        const { rows } = await h.pool.query('SELECT 1 FROM rider_deposits WHERE rider_id = $1', [riderId]);

        assert.deepEqual(again.body, { applied: false, reason: 'Payment already applied' });
        assert.equal(rows.length, 1);
    });

    it('refuses a bad signature and a wrong amount without changing anything', async () => {
        const { token, applicationId } = await approvedApplication();
        const { body: { order } } = await createOrder(token);

        const badSignature = await sendWebhook({ event: 'payment.captured', paymentId: 'PAY-1', orderId: order.orderId, amount: 2000 }, 'ab'.repeat(32));
        const wrongAmount = await sendWebhook({ event: 'payment.captured', paymentId: 'PAY-1', orderId: order.orderId, amount: 1 });
        const unknownOrder = await sendWebhook({ event: 'payment.captured', paymentId: 'PAY-1', orderId: 'ORD-NOPE', amount: 2000 });

        assert.equal(badSignature.status, 401);
        assert.equal(wrongAmount.status, 400);
        assert.equal(unknownOrder.status, 404);
        assert.equal(await applicationStatus(applicationId), 'Payment Pending');
    });

    it('records a failed payment, and the rider can try again', async () => {
        const { token } = await approvedApplication();
        const { body: { order } } = await createOrder(token);

        const failed = await sendWebhook({ event: 'payment.failed', paymentId: 'PAY-F', orderId: order.orderId, amount: 2000, reason: 'Card declined' });
        const check = await h.riderApi('GET', `/api/rider-app/payments/orders/${order.orderId}`, undefined, token);
        const retry = await createOrder(token);

        assert.equal(failed.body.applied, true);
        assert.equal(check.body.order.status, 'Failed');
        assert.equal(check.body.order.failureReason, 'Card declined');
        assert.notEqual(retry.body.order.orderId, order.orderId);
    });

    it('accepts a payment that arrives after the order expired', async () => {
        const { token, applicationId } = await approvedApplication();
        const { body: { order } } = await createOrder(token);
        await h.pool.query(`UPDATE rider_payments SET expires_at = now() - interval '1 hour'`);

        const res = await captured(order);

        assert.equal(res.body.applied, true);
        assert.equal(await applicationStatus(applicationId), 'Bike Pending');
    });
});

describe('Mock capture (slide to pay)', () => {
    it('pays through the signed webhook, or fails on request', async () => {
        const { token, applicationId } = await approvedApplication();
        const { body: { order } } = await createOrder(token);

        const failed = await h.riderApi('POST', `/api/rider-app/payments/orders/${order.orderId}/mock-capture`, { outcome: 'fail' }, token);
        const { body: { order: retry } } = await createOrder(token);
        const paid = await h.riderApi('POST', `/api/rider-app/payments/orders/${retry.orderId}/mock-capture`, undefined, token);
        const again = await h.riderApi('POST', `/api/rider-app/payments/orders/${retry.orderId}/mock-capture`, undefined, token);

        assert.equal(failed.body.applied, true);
        assert.equal(paid.body.applied, true);
        assert.equal(again.status, 409);
        assert.equal(await applicationStatus(applicationId), 'Bike Pending');
    });

    it('cannot touch another rider\'s order, and is off without ENABLE_MOCK_PAY', async () => {
        const { token } = await approvedApplication();
        const { token: otherToken } = await approvedApplication();
        const { body: { order } } = await createOrder(token);

        const other = await h.riderApi('POST', `/api/rider-app/payments/orders/${order.orderId}/mock-capture`, undefined, otherToken);
        const otherRead = await h.riderApi('GET', `/api/rider-app/payments/orders/${order.orderId}`, undefined, otherToken);

        process.env.ENABLE_MOCK_PAY = 'false';
        const off = await h.riderApi('POST', `/api/rider-app/payments/orders/${order.orderId}/mock-capture`, undefined, token);
        process.env.ENABLE_MOCK_PAY = 'true';

        assert.equal(other.status, 404);
        assert.equal(otherRead.status, 404);
        assert.equal(off.status, 404);
    });
});

describe('Admin Mark paid', () => {
    it('marks the deposit paid with a reference and moves the rider to the Bike tab', async () => {
        const { token, applicationId } = await approvedApplication();
        const { body: { order } } = await createOrder(token);

        const res = await h.api('POST', `${appBase(applicationId)}/mark-paid`, { purpose: 'Deposit', reference: 'UTR123456', note: 'Paid by UPI at the hub' });

        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.application.status, 'Bike Pending');
        const paidOrder = res.body.application.payments.orders.find(item => item.orderId === order.orderId);
        assert.equal(paidOrder.method, 'Manual');
        assert.equal(paidOrder.reference, 'UTR123456');
        assert.equal(paidOrder.markedBy, 'User admin@test.local');
        assert.equal(res.body.application.timeline.at(-1).event, 'deposit_paid');
    });

    it('works with no order started, needs a reference, and never reuses one', async () => {
        const { applicationId } = await approvedApplication();
        const { applicationId: secondId } = await approvedApplication();

        const noReference = await h.api('POST', `${appBase(applicationId)}/mark-paid`, { purpose: 'Deposit' });
        const ok = await h.api('POST', `${appBase(applicationId)}/mark-paid`, { purpose: 'Deposit', reference: 'UTR-1' });
        const reused = await h.api('POST', `${appBase(secondId)}/mark-paid`, { purpose: 'Deposit', reference: 'UTR-1' });
        const twice = await h.api('POST', `${appBase(applicationId)}/mark-paid`, { purpose: 'Deposit', reference: 'UTR-2' });

        assert.equal(noReference.status, 400);
        assert.equal(ok.status, 200);
        assert.equal(ok.body.application.payments.orders[0].amount, 2000);
        assert.equal(reused.status, 409);
        assert.equal(twice.status, 409);
    });

    it('is for admins only', async () => {
        const { applicationId } = await approvedApplication();
        const body = { purpose: 'Deposit', reference: 'UTR-9' };

        for (const role of ['staff', 'onboarding', 'team_leader']) {
            const cookie = await h.signIn(await h.createUser({ email: `${role}@test.local`, role }));
            const res = await h.api('POST', `${appBase(applicationId)}/mark-paid`, body, { Cookie: cookie });
            assert.equal(res.status, 403, role);
        }
    });

    it('records a webhook that arrives after Mark paid as an extra payment', async () => {
        const { token, applicationId } = await approvedApplication();
        const { body: { order } } = await createOrder(token);
        await h.api('POST', `${appBase(applicationId)}/mark-paid`, { purpose: 'Deposit', reference: 'UTR-5' });

        const late = await captured(order);
        const { body: { application } } = await h.api('GET', appBase(applicationId));

        assert.equal(late.body.applied, false);
        assert.equal(application.timeline.at(-1).event, 'extra_payment');
        assert.equal(application.status, 'Bike Pending');
    });
});

describe('Payment tab', () => {
    it('lists what is due and the last attempt', async () => {
        const { token } = await approvedApplication({ planType: 'Prepaid' });
        const { body: { order } } = await createOrder(token);
        await sendWebhook({ event: 'payment.failed', paymentId: 'PAY-F', orderId: order.orderId, amount: 2000, reason: 'Card declined' });

        const res = await h.api('GET', '/api/onboarding/applications?tab=payment');
        const [row] = res.body.applications;

        assert.equal(res.body.counts.payment, 1);
        assert.deepEqual(row.payment.due, ['Deposit', 'PrepaidPack']);
        assert.equal(row.payment.amountDue, 3000);
        assert.equal(row.payment.lastAttempt.status, 'Failed');
        assert.equal(row.payment.lastAttempt.failureReason, 'Card declined');
    });
});
