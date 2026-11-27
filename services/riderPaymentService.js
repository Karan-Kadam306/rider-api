const crypto = require('crypto');
const { pool, inTransaction } = require('../db');
const AppError = require('../errors/AppError');
const applicationRepository = require('../repositories/applicationRepository');
const riderPaymentRepository = require('../repositories/riderPaymentRepository');
const pricingRepository = require('../repositories/pricingRepository');

// What an approved rider pays before getting a bike: the deposit, then for prepaid riders their
// first weekly pack. Amounts are always set here, never sent by the app. Every change locks the
// application first, so an order, a webhook and an admin's Mark paid cannot cross each other.

const PURPOSES = ['Deposit', 'PrepaidPack'];
// How long the app may take to pay an order. A payment that arrives later is still accepted.
const ORDER_VALID_MINUTES = 30;
// The app makes one key per Pay tap and sends it again on a retry.
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const REFERENCE_MAX_LENGTH = 100;
const NOTE_MAX_LENGTH = 500;

const PAID_EVENTS = { Deposit: 'deposit_paid', PrepaidPack: 'pack_paid' };

// In the order they are paid.
function purposesFor(planType) {
    return planType === 'Prepaid' ? ['Deposit', 'PrepaidPack'] : ['Deposit'];
}

function newOrderId() {
    return `ORD-${crypto.randomBytes(10).toString('hex').toUpperCase()}`;
}

function parseId(value, field) {
    if (!/^[1-9]\d{0,14}$/.test(String(value))) {
        throw new AppError(`${field} must be a positive whole number`, 400);
    }

    return Number(value);
}

function cleanText(value, field, maxLength, { required }) {
    const clean = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

    if (required && !clean) {
        throw new AppError(`${field} is required`, 400);
    }

    if (clean.length > maxLength) {
        throw new AppError(`${field} must be at most ${maxLength} characters`, 400);
    }

    return clean || null;
}

function cleanPurpose(purpose) {
    if (!PURPOSES.includes(purpose)) {
        throw new AppError(`purpose must be one of: ${PURPOSES.join(', ')}`, 400);
    }

    return purpose;
}

function toOrder(row) {
    return {
        orderId: row.order_id,
        purpose: row.purpose,
        amount: row.amount,
        status: row.status,
        expiresAt: row.expires_at,
        method: row.method,
        reference: row.gateway_payment_id ?? row.manual_reference,
        markedBy: row.marked_by,
        note: row.note,
        failureReason: row.failure_reason,
        paidAt: row.paid_at,
        createdAt: row.created_at
    };
}

// The price of a payment today: the deposit in effect, or the chosen pack's price. The pack is
// charged even if it has since been taken off sale: the rider chose it and was approved with it.
async function priceOf(client, { purpose, packId }) {
    if (purpose === 'Deposit') {
        const deposit = await pricingRepository.findDepositInEffect(client);
        return deposit && { amount: deposit.amount, depositId: deposit.deposit_id, packId: null };
    }

    const pack = await pricingRepository.findPrepaidPackById(client, { packId });
    return pack && { amount: pack.price, depositId: null, packId: pack.pack_id };
}

async function priceOrThrow(client, application, purpose) {
    const price = await priceOf(client, { purpose, packId: application.prepaid_pack_id });

    if (!price) {
        throw new AppError('The deposit amount has not been set yet. Please contact your hub', 409);
    }

    return price;
}

const isPaid = (payments, purpose) => payments.some(payment => payment.purpose === purpose && payment.status === 'Paid');

// Each payment the application needs, paid or due, with the amount and any open order.
async function summarise(client, { applicationId, planType, packId }) {
    const payments = await riderPaymentRepository.findByApplication(client, { applicationId });
    const items = [];

    for (const purpose of purposesFor(planType)) {
        const own = payments.filter(payment => payment.purpose === purpose);
        const paid = own.find(payment => payment.status === 'Paid');
        const open = own.find(payment => payment.status === 'Created');
        const price = paid || open ? null : await priceOf(client, { purpose, packId });

        items.push({
            purpose,
            status: paid ? 'Paid' : 'Due',
            amount: paid?.amount ?? open?.amount ?? price?.amount ?? null,
            paidAt: paid?.paid_at ?? null,
            openOrder: open ? toOrder(open) : null
        });
    }

    return { items, orders: payments.map(toOrder) };
}

// The rider app's payment screen: what is paid, what is due, and which one to pay next.
async function getRiderPayments(applicationId) {
    const application = await applicationRepository.findOnboarding(pool, { applicationId });
    const { items } = await summarise(pool, { applicationId, planType: application.plan_type, packId: application.pack_id });
    const nextDue = application.status === 'Payment Pending'
        ? items.find(item => item.status === 'Due')?.purpose ?? null
        : null;

    return { applicationStatus: application.status, payments: items, nextDue };
}

// For the admin review page and the rider page.
async function getApplicationPayments({ applicationId, planType, packId, riderId }) {
    const summary = await summarise(pool, { applicationId, planType, packId });
    const deposit = riderId ? await riderPaymentRepository.findDepositByRider(pool, { riderId }) : null;

    return {
        ...summary,
        deposit: deposit && {
            amount: deposit.amount,
            status: deposit.status,
            heldSince: deposit.held_since,
            orderId: deposit.order_id,
            reference: deposit.reference
        }
    };
}

// Starts paying one item. The same Idempotency-Key, or a tap while an order is still open,
// gets the same order back, so a double tap never charges twice.
async function createOrder({ applicationId, purpose, idempotencyKey }) {
    cleanPurpose(purpose);

    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey ?? '')) {
        throw new AppError('Send an Idempotency-Key header of 8 to 100 letters, digits, - or _', 400);
    }

    const createdOrderId = await inTransaction(async client => {
        const application = await applicationRepository.findForUpdate(client, { applicationId });
        const repeat = application.rider_id && await riderPaymentRepository.findByIdempotencyKey(client, {
            riderId: application.rider_id,
            idempotencyKey
        });

        if (repeat) {
            if (repeat.purpose !== purpose) {
                throw new AppError('This Idempotency-Key was already used for another payment', 409);
            }

            return repeat.order_id;
        }

        if (application.status !== 'Payment Pending') {
            throw new AppError('There is nothing to pay right now', 409);
        }

        const purposes = purposesFor(application.plan_type);

        if (!purposes.includes(purpose)) {
            throw new AppError('A postpaid plan has no pack to pay for', 409);
        }

        const payments = await riderPaymentRepository.findByApplication(client, { applicationId });

        if (isPaid(payments, purpose)) {
            throw new AppError('This has already been paid', 409);
        }

        if (purposes.slice(0, purposes.indexOf(purpose)).some(earlier => !isPaid(payments, earlier))) {
            throw new AppError('Pay the deposit first', 409);
        }

        const open = payments.find(payment => payment.purpose === purpose && payment.status === 'Created');

        if (open) {
            return open.order_id;
        }

        await riderPaymentRepository.expireStaleOrder(client, { applicationId, purpose });

        const price = await priceOrThrow(client, application, purpose);
        const orderId = newOrderId();

        await riderPaymentRepository.insertOrder(client, {
            orderId,
            applicationId,
            riderId: application.rider_id,
            purpose,
            amount: price.amount,
            depositId: price.depositId,
            packId: price.packId,
            idempotencyKey,
            validMinutes: ORDER_VALID_MINUTES
        });
        await applicationRepository.insertEvent(client, {
            applicationId,
            eventType: 'payment_started',
            actorType: 'rider',
            data: { orderId, purpose, amount: price.amount }
        });

        return orderId;
    });

    return toOrder(await riderPaymentRepository.findByOrderId(pool, { orderId: createdOrderId }));
}

// One of the signed-in rider's orders, for the app to check after paying.
async function getOrder({ riderId, orderId }) {
    const order = typeof orderId === 'string' && await riderPaymentRepository.findByOrderId(pool, { orderId });

    if (!order || !riderId || order.rider_id !== riderId) {
        throw new AppError('Payment not found', 404);
    }

    return toOrder(order);
}

// Runs inside the caller's transaction, after the order is marked Paid. Records the deposit, and
// once everything is paid moves the application on to the Bike tab. A second payment for something
// already paid is only recorded, for an admin to refund.
async function afterPaid(client, { application, order, actorType, userId = null, method, reference, note = null }) {
    const payments = await riderPaymentRepository.findByApplication(client, { applicationId: application.application_id });
    const paidCount = payments.filter(payment => payment.purpose === order.purpose && payment.status === 'Paid').length;
    const event = { applicationId: application.application_id, actorType, actorUserId: userId, note };
    const data = { orderId: order.order_id, purpose: order.purpose, amount: order.amount, method, reference };

    if (paidCount > 1) {
        await applicationRepository.insertEvent(client, { ...event, eventType: 'extra_payment', data });
        return;
    }

    if (order.purpose === 'Deposit') {
        await riderPaymentRepository.insertDeposit(client, {
            riderId: order.rider_id,
            paymentId: order.payment_id,
            amount: order.amount
        });
    }

    const allPaid = purposesFor(application.plan_type).every(purpose => isPaid(payments, purpose));
    const movesOn = allPaid && application.status === 'Payment Pending';

    if (movesOn) {
        await applicationRepository.markBikePending(client, { applicationId: application.application_id });
    }

    await applicationRepository.insertEvent(client, {
        ...event,
        eventType: PAID_EVENTS[order.purpose],
        fromStatus: movesOn ? application.status : null,
        toStatus: movesOn ? 'Bike Pending' : null,
        data
    });
}

// The payment provider's webhook for an order: payment.captured or payment.failed. Returns
// { applied } so a replayed or late webhook still gets a 200 without changing anything twice.
async function applyGatewayEvent({ event, paymentId, orderId, amount, reason }) {
    const found = await riderPaymentRepository.findByOrderId(pool, { orderId });

    if (!found) {
        throw new AppError('Payment order not found', 404);
    }

    return inTransaction(async client => {
        const application = await applicationRepository.findForUpdate(client, { applicationId: found.application_id });
        const order = await riderPaymentRepository.findByOrderId(client, { orderId, forUpdate: true });

        if (event === 'payment.failed') {
            if (!['Created', 'Expired'].includes(order.status)) {
                return { applied: false, reason: `Order is ${order.status}` };
            }

            const failureReason = cleanText(reason, 'reason', NOTE_MAX_LENGTH, { required: false }) ?? 'Payment failed';
            await riderPaymentRepository.markFailed(client, { paymentId: order.payment_id, reason: failureReason });
            await applicationRepository.insertEvent(client, {
                applicationId: application.application_id,
                eventType: 'payment_failed',
                actorType: 'system',
                note: failureReason,
                data: { orderId, purpose: order.purpose, amount: order.amount }
            });

            return { applied: true };
        }

        if (order.gateway_payment_id === paymentId) {
            return { applied: false, reason: 'Payment already applied' };
        }

        if (amount !== order.amount) {
            throw new AppError('Paid amount does not match the order', 400);
        }

        // Already paid (by hand, or another capture): the money is recorded for a refund.
        if (order.status === 'Paid') {
            await applicationRepository.insertEvent(client, {
                applicationId: application.application_id,
                eventType: 'extra_payment',
                actorType: 'system',
                data: { orderId, purpose: order.purpose, amount, method: 'Gateway', reference: paymentId }
            });

            return { applied: false, reason: 'Order was already paid; recorded as an extra payment' };
        }

        await riderPaymentRepository.markPaidByGateway(client, { paymentId: order.payment_id, gatewayPaymentId: paymentId });
        await afterPaid(client, { application, order, actorType: 'system', method: 'Gateway', reference: paymentId });

        return { applied: true };
    });
}

// Admin fallback when the rider paid but the webhook never came. Uses the open order if there is
// one, otherwise records a new one at today's price.
async function markPaidManually({ applicationId, purpose, reference, note, userId }) {
    const id = parseId(applicationId, 'applicationId');
    cleanPurpose(purpose);
    const cleanReference = cleanText(reference, 'reference', REFERENCE_MAX_LENGTH, { required: true });
    const cleanNote = cleanText(note, 'note', NOTE_MAX_LENGTH, { required: false });

    await inTransaction(async client => {
        const application = await applicationRepository.findForUpdate(client, { applicationId: id });

        if (!application) {
            throw new AppError('Application not found', 404);
        }

        if (application.status !== 'Payment Pending') {
            throw new AppError(`A ${application.status} application has nothing to pay`, 409);
        }

        if (!purposesFor(application.plan_type).includes(purpose)) {
            throw new AppError('A postpaid plan has no pack to pay for', 409);
        }

        const payments = await riderPaymentRepository.findByApplication(client, { applicationId: id });

        if (isPaid(payments, purpose)) {
            throw new AppError('This has already been paid', 409);
        }

        if (await riderPaymentRepository.referenceExists(client, { reference: cleanReference })) {
            throw new AppError('This reference was already used for another payment', 409);
        }

        let orderId = payments.find(payment => payment.purpose === purpose && payment.status === 'Created')?.order_id;

        if (!orderId) {
            await riderPaymentRepository.expireStaleOrder(client, { applicationId: id, purpose });

            const price = await priceOrThrow(client, application, purpose);
            orderId = newOrderId();

            await riderPaymentRepository.insertOrder(client, {
                orderId,
                applicationId: id,
                riderId: application.rider_id,
                purpose,
                amount: price.amount,
                depositId: price.depositId,
                packId: price.packId,
                idempotencyKey: null,
                validMinutes: ORDER_VALID_MINUTES
            });
        }

        const order = await riderPaymentRepository.findByOrderId(client, { orderId, forUpdate: true });

        await riderPaymentRepository.markPaidManually(client, {
            paymentId: order.payment_id,
            reference: cleanReference,
            note: cleanNote,
            userId
        });
        await afterPaid(client, {
            application,
            order,
            actorType: 'user',
            userId,
            method: 'Manual',
            reference: cleanReference,
            note: cleanNote
        });
    });

    return id;
}

module.exports = {
    PURPOSES,
    ORDER_VALID_MINUTES,
    purposesFor,
    getRiderPayments,
    getApplicationPayments,
    createOrder,
    getOrder,
    applyGatewayEvent,
    markPaidManually
};
