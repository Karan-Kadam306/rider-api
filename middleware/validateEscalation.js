const AppError = require('../errors/AppError');

const ESCALATION_REASONS = [
    'Payment Due',
    'SOP Violation',
    'Attendance Issues',
    'Safety Concern',
    'Customer Complaint',
    'Document Non-Compliance',
    'Bike Misuse',
    'Partner Deactivation',
    'Policy Violation',
    'Other'
];

// Validate the body for raising an escalation: { reasons, amount?, comment? }.
// No amount makes it a Record. For Payment Due the amount is ignored; the service sets it.
function validateRaiseEscalation(req, res, next) {
    const { reasons, amount, comment } = req.body ?? {};

    if (
        !Array.isArray(reasons) ||
        reasons.length === 0 ||
        !reasons.every(reason => ESCALATION_REASONS.includes(reason)) ||
        new Set(reasons).size !== reasons.length
    ) {
        return next(new AppError(`reasons must be a list of: ${ESCALATION_REASONS.join(', ')}`, 400));
    }

    if (comment != null && (typeof comment !== 'string' || comment.length > 1000)) {
        return next(new AppError('comment must be text of at most 1000 characters', 400));
    }

    if (reasons.includes('Other') && !comment?.trim()) {
        return next(new AppError('A comment is required when the reason is Other', 400));
    }

    if (
        amount != null &&
        !reasons.includes('Payment Due') &&
        (typeof amount !== 'number' || !(amount > 0) || amount > 99999999 || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6)
    ) {
        return next(new AppError('amount must be a positive number with at most 2 decimals', 400));
    }

    req.body = {
        reasons,
        amount: reasons.includes('Payment Due') ? null : amount ?? null,
        comment: comment?.trim() || null
    };

    return next();
}

// Use after validateRaiseEscalation. A team leader may raise only a Record: no amount, and not
// Payment Due (which collects the balance). Both lock the bike, which stays an admin decision.
function limitTeamLeaderEscalation(req, res, next) {
    if (req.user?.role === 'team_leader' && (req.body.amount != null || req.body.reasons.includes('Payment Due'))) {
        return next(new AppError('Team leaders can only record an escalation: no amount and not Payment Due', 403));
    }

    return next();
}

// Validate a required text field on an escalation action, e.g. the waive reason.
function validateEscalationText(field) {
    return (req, res, next) => {
        const value = req.body?.[field];

        if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) {
            return next(new AppError(`${field} is required and must be at most 200 characters`, 400));
        }

        return next();
    };
}

// The :escalationId path parameter must be a positive whole number.
function validateEscalationId(req, res, next) {
    const escalationId = Number(req.params.escalationId);

    if (!Number.isSafeInteger(escalationId) || escalationId <= 0) {
        return next(new AppError('A valid escalationId is required', 400));
    }

    return next();
}

module.exports = {
    ESCALATION_REASONS,
    validateRaiseEscalation,
    limitTeamLeaderEscalation,
    validateEscalationText,
    validateEscalationId
};
