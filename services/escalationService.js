const { pool, inTransaction } = require('../db');
const AppError = require('../errors/AppError');
const riderRepository = require('../repositories/riderRepository');
const bikeAssignmentRepository = require('../repositories/bikeAssignmentRepository');
const payoutRepository = require('../repositories/payoutRepository');
const escalationRepository = require('../repositories/escalationRepository');
const iotLockClient = require('./integrations/iotLockClient');
const paymentLinkClient = require('./integrations/paymentLinkClient');
const { currentWeekStart } = require('./billingService');

function toEscalation(row) {
    return {
        escalationId: row.escalation_id,
        riderId: row.rider_id,
        kind: row.kind,
        reasons: row.reasons,
        comment: row.comment,
        amount: row.amount,
        weekStart: row.week_start,
        status: row.status,
        lockStatus: row.lock_status,
        bikeId: row.bike_id,
        paymentLink: row.payment_token && row.status === 'Open' ? paymentLinkClient.linkUrl(row.payment_token) : null,
        paymentRef: row.payment_ref,
        resolutionNote: row.resolution_note,
        resolvedAt: row.resolved_at,
        resolvedBy: row.resolved_by,
        createdAt: row.created_at,
        createdBy: row.created_by,
        events: row.events ?? []
    };
}

// Last week's negative net carried into this week, as a positive amount owed.
async function getOutstandingBalance(riderId) {
    const [carried] = await payoutRepository.findCarriedBalances(pool, { weekStart: currentWeekStart(), riderId });
    return carried ? -carried.balance : 0;
}

async function findEscalationOrThrow(escalationId) {
    const escalation = await escalationRepository.findById(pool, { escalationId });

    if (!escalation) {
        throw new AppError('Escalation not found', 404);
    }

    return escalation;
}

// Lock the escalation's bike. A failed lock keeps the escalation Open with lock status Failed,
// so an admin can retry it.
async function lockBike(escalationId, bikeId, userId) {
    try {
        const { lockRef } = await iotLockClient.lockBike(bikeId);

        await inTransaction(async client => {
            await escalationRepository.updateLock(client, { escalationIds: [escalationId], lockStatus: 'Locked', lockRef });
            await escalationRepository.insertEvent(client, { escalationId, eventType: 'BikeLocked', detail: { bikeId, lockRef }, userId });
        });
    } catch (error) {
        await escalationRepository.insertEvent(pool, {
            escalationId,
            eventType: 'LockFailed',
            detail: { bikeId, error: error.message },
            userId
        });
    }
}

// Release the locks the given escalations hold on a bike. The bike is unlocked only when
// no other escalation still holds it. A failed unlock is recorded and does not undo anything.
async function releaseLocks(escalationIds, bikeId, userId, reason) {
    const stillLocked = (await escalationRepository.findLockedByBike(pool, { bikeId }))
        .filter(id => !escalationIds.includes(id));

    if (stillLocked.length > 0) {
        return;
    }

    try {
        await iotLockClient.unlockBike(bikeId);

        await inTransaction(async client => {
            await escalationRepository.updateLock(client, { escalationIds, lockStatus: 'Unlocked' });

            for (const escalationId of escalationIds) {
                await escalationRepository.insertEvent(client, { escalationId, eventType: 'BikeUnlocked', detail: { bikeId, reason }, userId });
            }
        });
    } catch (error) {
        for (const escalationId of escalationIds) {
            await escalationRepository.insertEvent(pool, {
                escalationId,
                eventType: 'UnlockFailed',
                detail: { bikeId, error: error.message },
                userId
            });
        }
    }
}

// After an escalation ends: paying or waiving a Payment Due clears the carried balance, so it also
// releases locks left by Recovered charges on the bike; a Charge releases only its own lock.
async function releaseAfterResolve(resolved, userId, reason) {
    if (resolved.lock_status !== 'Locked') {
        return;
    }

    const escalationIds = resolved.kind === 'Collection'
        ? await escalationRepository.findLockedByBike(pool, { bikeId: resolved.bike_id })
        : [resolved.escalation_id];

    await releaseLocks(escalationIds, resolved.bike_id, userId, reason);
}

// Raise an escalation. Payment Due collects the outstanding balance; any other reason with an
// amount is a Charge; without an amount it is a Record (no lock or link).
// Charges and collections lock the rider's bike and get a payment link.
async function raiseEscalation({ riderId, reasons, amount, comment, userId }) {
    const rider = await riderRepository.findById(riderId);

    if (!rider) {
        throw new AppError('Rider not found', 404);
    }

    if (rider.status === 'Terminated') {
        throw new AppError('Cannot escalate a terminated rider', 409);
    }

    let kind = amount == null ? 'Record' : 'Charge';

    // The amount for Payment Due always comes from the balance, never from the form.
    if (reasons.includes('Payment Due')) {
        kind = 'Collection';
        amount = await getOutstandingBalance(riderId);

        if (amount <= 0) {
            throw new AppError('Rider has no outstanding balance for Payment Due', 400);
        }
    }

    if (kind === 'Record') {
        const escalationId = await inTransaction(async client => {
            const id = await escalationRepository.insertEscalation(client, {
                riderId, kind, reasons, comment, amount: null, weekStart: currentWeekStart(),
                lockStatus: null, bikeId: null, paymentToken: null, createdBy: userId
            });

            await escalationRepository.insertEvent(client, { escalationId: id, eventType: 'Raised', userId });
            return id;
        });

        return toEscalation(await escalationRepository.findById(pool, { escalationId }));
    }

    const assignment = await bikeAssignmentRepository.findActiveAssignmentByRider(pool, riderId);
    const bikeId = assignment?.bike_id ?? null;
    const { token, url } = await paymentLinkClient.createLink();

    // Saved as Failed until the lock below succeeds, so a crash in between still shows a retry.
    const escalationId = await inTransaction(async client => {
        const id = await escalationRepository.insertEscalation(client, {
            riderId, kind, reasons, comment, amount, weekStart: currentWeekStart(),
            lockStatus: bikeId ? 'Failed' : 'NoBike', bikeId, paymentToken: token, createdBy: userId
        });

        await escalationRepository.insertEvent(client, { escalationId: id, eventType: 'Raised', detail: { amount }, userId });
        await escalationRepository.insertEvent(client, { escalationId: id, eventType: 'LinkSent', detail: { url }, userId });
        return id;
    });

    // The IoT call is outside the transaction: a slow device never holds a database lock.
    if (bikeId) {
        await lockBike(escalationId, bikeId, userId);
    }

    return toEscalation(await escalationRepository.findById(pool, { escalationId }));
}

async function listEscalations({ riderId, openOnly = false }) {
    const rows = await escalationRepository.findByRider(pool, { riderId, openOnly });
    return rows.map(toEscalation);
}

async function retryLock({ escalationId, userId }) {
    const escalation = await findEscalationOrThrow(escalationId);

    if (escalation.status !== 'Open' || escalation.lock_status !== 'Failed') {
        throw new AppError('Only an open escalation with a failed lock can be retried', 409);
    }

    await lockBike(escalationId, escalation.bike_id, userId);
    return toEscalation(await escalationRepository.findById(pool, { escalationId }));
}

// End an Open escalation as Paid, Waived or Closed and record who did it.
async function resolve({ escalationId, status, eventType, paymentRef, note, userId, allowedKinds }) {
    const escalation = await findEscalationOrThrow(escalationId);

    if (!allowedKinds.includes(escalation.kind)) {
        throw new AppError(`A ${escalation.kind} escalation cannot be ${status.toLowerCase()}`, 409);
    }

    const resolved = await inTransaction(async client => {
        const row = await escalationRepository.resolveEscalation(client, { escalationId, status, paymentRef, note, userId });

        if (!row) {
            throw new AppError('Escalation is no longer open', 409);
        }

        await escalationRepository.insertEvent(client, { escalationId, eventType, detail: { paymentRef, note }, userId });
        return row;
    });

    await releaseAfterResolve(resolved, userId, status);
    return toEscalation(await escalationRepository.findById(pool, { escalationId }));
}

// Manual fallback when the payment webhook did not arrive.
function markPaid({ escalationId, reference, userId }) {
    return resolve({
        escalationId, status: 'Paid', eventType: 'MarkedPaid', paymentRef: reference, note: null, userId,
        allowedKinds: ['Charge', 'Collection']
    });
}

function waive({ escalationId, reason, userId }) {
    return resolve({
        escalationId, status: 'Waived', eventType: 'Waived', paymentRef: null, note: reason, userId,
        allowedKinds: ['Charge', 'Collection']
    });
}

function close({ escalationId, note, userId }) {
    return resolve({
        escalationId, status: 'Closed', eventType: 'Closed', paymentRef: null, note, userId,
        allowedKinds: ['Record']
    });
}

// Payment webhook. Returns { applied } so a replayed or late webhook gets 200 without changes.
async function applyPayment({ paymentId, token, amount }) {
    const escalation = await escalationRepository.findByToken(pool, { paymentToken: token });

    if (!escalation) {
        throw new AppError('Payment link not found', 404);
    }

    if (escalation.payment_ref === paymentId) {
        return { applied: false, reason: 'Payment already applied' };
    }

    if (Number(amount) !== escalation.amount) {
        throw new AppError('Paid amount does not match the escalation', 400);
    }

    const resolved = await inTransaction(async client => {
        const row = await escalationRepository.resolveEscalation(client, {
            escalationId: escalation.escalation_id, status: 'Paid', paymentRef: paymentId
        });

        if (row) {
            await escalationRepository.insertEvent(client, {
                escalationId: row.escalation_id, eventType: 'Paid', detail: { paymentId, amount }
            });
        }

        return row;
    });

    if (!resolved) {
        return { applied: false, reason: `Escalation is ${escalation.status}` };
    }

    await releaseAfterResolve(resolved, null, 'Paid');
    return { applied: true };
}

// What the mock pay page shows for a link.
async function getPaymentLink(token) {
    const escalation = await escalationRepository.findByToken(pool, { paymentToken: token });

    if (!escalation) {
        throw new AppError('Payment link not found', 404);
    }

    return {
        riderName: escalation.rider_name,
        amount: escalation.amount,
        status: escalation.status,
        payable: escalation.status === 'Open'
    };
}

// A bike back at the hub can go to another rider, so every lock on it is released.
async function releaseLocksForReturnedBike(bikeId) {
    const escalationIds = await escalationRepository.findLockedByBike(pool, { bikeId });

    if (escalationIds.length > 0) {
        await releaseLocks(escalationIds, bikeId, null, 'Bike returned');
    }
}

module.exports = {
    getOutstandingBalance,
    raiseEscalation,
    listEscalations,
    retryLock,
    markPaid,
    waive,
    close,
    applyPayment,
    getPaymentLink,
    releaseLocksForReturnedBike
};
