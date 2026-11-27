const express = require('express');

const escalationController = require('../controllers/escalationController');
const paymentWebhookController = require('../controllers/paymentWebhookController');
const AppError = require('../errors/AppError');

// Payment provider webhook. The signature covers the exact bytes sent, so the body is read raw.
const webhookRouter = express.Router();
webhookRouter.post('/payment', express.raw({ type: 'application/json', limit: '10kb' }), paymentWebhookController.handlePaymentWebhook);

// Mock rider app: the payment link page and its swipe to pay. Off unless ENABLE_MOCK_PAY=true.
const mockPayRouter = express.Router();

mockPayRouter.use((req, res, next) => {
    if (process.env.ENABLE_MOCK_PAY !== 'true') {
        return next(new AppError('Route not found', 404));
    }

    return next();
});

mockPayRouter.get('/:token', escalationController.getMockPayment);
mockPayRouter.post('/:token/swipe', escalationController.swipeToPay);

module.exports = {
    webhookRouter,
    mockPayRouter
};
