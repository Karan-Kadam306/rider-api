const crypto = require('crypto');
const AppError = require('../errors/AppError');
const escalationService = require('../services/escalationService');
const paymentWebhook = require('../services/integrations/paymentWebhook');

// GET /api/riders/:riderId/escalations
// List a rider's escalations with their timelines, newest first.
async function listEscalations(req, res, next) {
    try {
        const escalations = await escalationService.listEscalations({ riderId: req.params.riderId });

        return res.status(200).json({ count: escalations.length, escalations });
    } catch (error) {
        return next(error);
    }
}

// POST /api/riders/:riderId/escalations
// Body: { reasons, amount?, comment? }. Locks the bike and sends a payment link unless it is a Record.
async function raiseEscalation(req, res, next) {
    try {
        const escalation = await escalationService.raiseEscalation({
            riderId: req.params.riderId,
            ...req.body,
            userId: req.user.userId
        });

        return res.status(201).json({ message: 'Escalation raised', escalation });
    } catch (error) {
        return next(error);
    }
}

// POST /api/escalations/:escalationId/mark-paid
// Body: { reference }. For when the rider paid but the webhook did not arrive.
async function markPaid(req, res, next) {
    try {
        const escalation = await escalationService.markPaid({
            escalationId: Number(req.params.escalationId),
            reference: req.body.reference.trim(),
            userId: req.user.userId
        });

        return res.status(200).json({ message: 'Escalation marked as paid', escalation });
    } catch (error) {
        return next(error);
    }
}

// POST /api/escalations/:escalationId/waive
// Body: { reason }.
async function waive(req, res, next) {
    try {
        const escalation = await escalationService.waive({
            escalationId: Number(req.params.escalationId),
            reason: req.body.reason.trim(),
            userId: req.user.userId
        });

        return res.status(200).json({ message: 'Escalation waived', escalation });
    } catch (error) {
        return next(error);
    }
}

// POST /api/escalations/:escalationId/close
// Body: { note }. Ends a Record escalation.
async function close(req, res, next) {
    try {
        const escalation = await escalationService.close({
            escalationId: Number(req.params.escalationId),
            note: req.body.note.trim(),
            userId: req.user.userId
        });

        return res.status(200).json({ message: 'Escalation closed', escalation });
    } catch (error) {
        return next(error);
    }
}

// POST /api/escalations/:escalationId/retry-lock
async function retryLock(req, res, next) {
    try {
        const escalation = await escalationService.retryLock({
            escalationId: Number(req.params.escalationId),
            userId: req.user.userId
        });

        return res.status(200).json({ escalation });
    } catch (error) {
        return next(error);
    }
}

// GET /api/mock-pay/:token
// What the mock rider app shows for a payment link.
async function getMockPayment(req, res, next) {
    try {
        const payment = await escalationService.getPaymentLink(req.params.token);

        return res.status(200).json({ payment });
    } catch (error) {
        return next(error);
    }
}

// POST /api/mock-pay/:token/swipe
// Plays the payment provider: sends a signed webhook to this server, as a real payment would.
async function swipeToPay(req, res, next) {
    try {
        const payment = await escalationService.getPaymentLink(req.params.token);

        if (!payment.payable) {
            throw new AppError(`This payment link is no longer payable (${payment.status})`, 409);
        }

        const body = JSON.stringify({
            paymentId: `MOCKPAY-${crypto.randomBytes(8).toString('hex')}`,
            token: req.params.token,
            amount: payment.amount
        });

        const webhookResponse = await fetch(`${req.protocol}://${req.get('host')}/api/webhooks/payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Payment-Signature': paymentWebhook.sign(body)
            },
            body
        });

        const result = await webhookResponse.json();

        return res.status(webhookResponse.status).json(result);
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    listEscalations,
    raiseEscalation,
    markPaid,
    waive,
    close,
    retryLock,
    getMockPayment,
    swipeToPay
};
