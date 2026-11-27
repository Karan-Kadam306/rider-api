const crypto = require('crypto');
const AppError = require('../errors/AppError');
const riderPaymentService = require('../services/riderPaymentService');
const paymentWebhook = require('../services/integrations/paymentWebhook');

// The signed-in phone's application (set by requireRider).
function applicationIdOf(req) {
    if (!req.rider.applicationId) {
        throw new AppError('No application found for this number', 404);
    }

    return req.rider.applicationId;
}

// GET /api/rider-app/payments
// What is paid and what is due before the bike, and which one to pay next.
async function getPayments(req, res, next) {
    try {
        return res.status(200).json(await riderPaymentService.getRiderPayments(applicationIdOf(req)));
    } catch (error) {
        return next(error);
    }
}

// POST /api/rider-app/payments/orders
// Header: Idempotency-Key. Body: { purpose: 'Deposit' | 'PrepaidPack' }. The amount is set by the server.
async function createOrder(req, res, next) {
    try {
        const order = await riderPaymentService.createOrder({
            applicationId: applicationIdOf(req),
            purpose: req.body?.purpose,
            idempotencyKey: req.get('Idempotency-Key')
        });

        return res.status(201).json({ order });
    } catch (error) {
        return next(error);
    }
}

// GET /api/rider-app/payments/orders/:orderId
// The app checks this after paying, until the webhook has marked the order Paid or Failed.
async function getOrder(req, res, next) {
    try {
        const order = await riderPaymentService.getOrder({ riderId: req.rider.riderId, orderId: req.params.orderId });
        return res.status(200).json({ order });
    } catch (error) {
        return next(error);
    }
}

// POST /api/rider-app/payments/orders/:orderId/mock-capture
// Body: { outcome?: 'fail' }. Plays the payment provider: sends this server a signed webhook, as a
// real payment would. Off unless ENABLE_MOCK_PAY=true; a real gateway's checkout replaces it.
async function mockCapture(req, res, next) {
    try {
        if (process.env.ENABLE_MOCK_PAY !== 'true') {
            throw new AppError('Route not found', 404);
        }

        const order = await riderPaymentService.getOrder({ riderId: req.rider.riderId, orderId: req.params.orderId });

        if (order.status !== 'Created') {
            throw new AppError(`This payment can no longer be paid (${order.status})`, 409);
        }

        const paymentId = `MOCKPAY-${crypto.randomBytes(8).toString('hex')}`;
        const body = JSON.stringify(req.body?.outcome === 'fail'
            ? { event: 'payment.failed', paymentId, orderId: order.orderId, amount: order.amount, reason: 'Declined by the bank (mock)' }
            : { event: 'payment.captured', paymentId, orderId: order.orderId, amount: order.amount });

        const webhookResponse = await fetch(`${req.protocol}://${req.get('host')}/api/webhooks/payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Payment-Signature': paymentWebhook.sign(body)
            },
            body
        });

        return res.status(webhookResponse.status).json(await webhookResponse.json());
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    getPayments,
    createOrder,
    getOrder,
    mockCapture
};
