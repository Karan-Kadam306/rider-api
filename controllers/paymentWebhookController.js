const AppError = require('../errors/AppError');
const escalationService = require('../services/escalationService');
const riderPaymentService = require('../services/riderPaymentService');
const paymentWebhook = require('../services/integrations/paymentWebhook');

const ORDER_EVENTS = ['payment.captured', 'payment.failed'];

// POST /api/webhooks/payment
// Called by the payment provider with a signed JSON body (req.body is the raw bytes):
//   onboarding payment orders: { event, paymentId, orderId, amount, reason? }
//   escalation payment links:  { paymentId, token, amount }
async function handlePaymentWebhook(req, res, next) {
    try {
        if (!paymentWebhook.verify(req.body, req.get('X-Payment-Signature'))) {
            throw new AppError('Invalid signature', 401);
        }

        let payload;

        try {
            payload = JSON.parse(req.body.toString('utf8'));
        } catch {
            throw new AppError('Request body is not valid JSON', 400);
        }

        const { event, paymentId, orderId, token, amount, reason } = payload ?? {};

        if (typeof paymentId !== 'string' || typeof amount !== 'number') {
            throw new AppError('paymentId and amount are required', 400);
        }

        if (orderId !== undefined) {
            if (typeof orderId !== 'string' || !ORDER_EVENTS.includes(event)) {
                throw new AppError(`orderId and an event (${ORDER_EVENTS.join(' or ')}) are required`, 400);
            }

            return res.status(200).json(await riderPaymentService.applyGatewayEvent({ event, paymentId, orderId, amount, reason }));
        }

        if (typeof token !== 'string') {
            throw new AppError('paymentId, token and amount are required', 400);
        }

        return res.status(200).json(await escalationService.applyPayment({ paymentId, token, amount }));
    } catch (error) {
        return next(error);
    }
}

module.exports = { handlePaymentWebhook };
