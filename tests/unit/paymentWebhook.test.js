const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const paymentWebhook = require('../../services/integrations/paymentWebhook');

describe('payment webhook signature', () => {
    let savedSecret;

    before(() => {
        savedSecret = process.env.PAYMENT_WEBHOOK_SECRET;
        process.env.PAYMENT_WEBHOOK_SECRET = 'test-secret';
    });

    after(() => {
        process.env.PAYMENT_WEBHOOK_SECRET = savedSecret;
    });

    const body = JSON.stringify({ paymentId: 'PAY-1', token: 'abc', amount: 500 });

    it('verifies a body it signed', () => {
        assert.equal(paymentWebhook.verify(body, paymentWebhook.sign(body)), true);
    });

    it('rejects a changed body, a wrong or missing signature', () => {
        const signature = paymentWebhook.sign(body);

        assert.equal(paymentWebhook.verify(body.replace('500', '5'), signature), false);
        assert.equal(paymentWebhook.verify(body, 'abcd'), false);
        assert.equal(paymentWebhook.verify(body, 'not hex'), false);
        assert.equal(paymentWebhook.verify(body, undefined), false);
    });

    it('fails closed when no secret is set', () => {
        const signature = paymentWebhook.sign(body);
        delete process.env.PAYMENT_WEBHOOK_SECRET;

        try {
            assert.equal(paymentWebhook.verify(body, signature), false);
        } finally {
            process.env.PAYMENT_WEBHOOK_SECRET = 'test-secret';
        }
    });
});
