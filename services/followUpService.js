const { pool } = require('../db');
const AppError = require('../errors/AppError');
const riderRepository = require('../repositories/riderRepository');
const escalationRepository = require('../repositories/escalationRepository');
const followUpRepository = require('../repositories/followUpRepository');
const { todayInIst, addDays } = require('./billingService');

const FOLLOW_UP_REASONS = ['Payment Due', 'Performance', 'Attendance', 'Other'];
const FOLLOW_UP_OUTCOMES = ['Promised to Pay', 'Paid', 'Unreachable', 'Refused', 'Will Improve', 'Other'];
const MAX_NOTE_LENGTH = 1000;
// A promise further out than this is not a real promise; ask the rider for a nearer date.
const MAX_PROMISE_DAYS = 30;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
    return typeof value === 'string' &&
        DATE_PATTERN.test(value) &&
        new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function isAmount(value) {
    return typeof value === 'number' &&
        value > 0 &&
        value <= 99999999 &&
        Math.abs(Math.round(value * 100) - value * 100) < 1e-6;
}

function toPagination(page, limit) {
    page = Number(page);
    limit = Number(limit);

    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new AppError('Page must be a positive integer and the page limit must be 1 to 100', 400);
    }

    return { page, limit, offset: (page - 1) * limit };
}

function toFollowUp(row) {
    return {
        followUpId: row.follow_up_id,
        riderId: row.rider_id,
        escalationId: row.escalation_id,
        reason: row.reason,
        outcome: row.outcome,
        note: row.note,
        promiseDate: row.promise_date,
        promiseAmount: row.promise_amount,
        createdAt: row.created_at,
        loggedBy: { userId: row.user_id, name: row.user_name, role: row.user_role }
    };
}

async function findRiderOrThrow(riderId) {
    const rider = await riderRepository.findById(riderId);

    if (!rider) {
        throw new AppError('Rider Not Found', 404);
    }

    return rider;
}

// Checks the body and returns the values to save. A promise needs a date from today up to
// MAX_PROMISE_DAYS ahead; its amount is optional. Other outcomes take no promise.
function validateFollowUp({ reason, outcome, note, promiseDate, promiseAmount, escalationId }) {
    if (!FOLLOW_UP_REASONS.includes(reason)) {
        throw new AppError(`reason must be one of: ${FOLLOW_UP_REASONS.join(', ')}`, 400);
    }

    if (!FOLLOW_UP_OUTCOMES.includes(outcome)) {
        throw new AppError(`outcome must be one of: ${FOLLOW_UP_OUTCOMES.join(', ')}`, 400);
    }

    if (typeof note !== 'string' || !note.trim() || note.trim().length > MAX_NOTE_LENGTH) {
        throw new AppError(`note is required, at most ${MAX_NOTE_LENGTH} characters: what did the rider say?`, 400);
    }

    const promised = outcome === 'Promised to Pay';

    if (promised) {
        const today = todayInIst();

        if (!isValidDate(promiseDate) || promiseDate < today || promiseDate > addDays(today, MAX_PROMISE_DAYS)) {
            throw new AppError(`promiseDate must be a date from today up to ${MAX_PROMISE_DAYS} days ahead`, 400);
        }

        if (promiseAmount != null && !isAmount(promiseAmount)) {
            throw new AppError('promiseAmount must be a positive number with at most 2 decimals', 400);
        }
    } else if (promiseDate != null || promiseAmount != null) {
        throw new AppError('Only a Promised to Pay follow-up takes a promise date or amount', 400);
    }

    if (escalationId != null && (!Number.isSafeInteger(escalationId) || escalationId < 1)) {
        throw new AppError('escalationId must be a positive integer', 400);
    }

    return {
        reason,
        outcome,
        note: note.trim(),
        promiseDate: promised ? promiseDate : null,
        promiseAmount: promised ? promiseAmount ?? null : null,
        escalationId: escalationId ?? null
    };
}

// Log what the rider said. Follow-ups cannot be edited or deleted afterwards.
async function logFollowUp({ riderId, userId, ...body }) {
    const values = validateFollowUp(body);
    await findRiderOrThrow(riderId);

    if (values.escalationId) {
        const escalation = await escalationRepository.findById(pool, { escalationId: values.escalationId });

        if (!escalation || escalation.rider_id !== riderId) {
            throw new AppError('That escalation does not belong to this rider', 400);
        }
    }

    const followUpId = await followUpRepository.insertFollowUp(pool, { riderId, userId, ...values });
    return toFollowUp(await followUpRepository.findById(pool, { followUpId }));
}

// The rider's follow-ups, newest first.
async function listFollowUps({ riderId, page = 1, limit = 20 }) {
    const pagination = toPagination(page, limit);
    await findRiderOrThrow(riderId);

    const [rows, totalRecords] = await Promise.all([
        followUpRepository.findByRider(pool, { riderId, limit: pagination.limit, offset: pagination.offset }),
        followUpRepository.countByRider(pool, { riderId })
    ]);

    return {
        pagination: { ...pagination, totalRecords, totalPages: Math.ceil(totalRecords / pagination.limit) },
        followUps: rows.map(toFollowUp)
    };
}

module.exports = {
    FOLLOW_UP_REASONS,
    FOLLOW_UP_OUTCOMES,
    MAX_PROMISE_DAYS,
    logFollowUp,
    listFollowUps
};
