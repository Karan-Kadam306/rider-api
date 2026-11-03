const AppError = require('../errors/AppError');
const payoutService = require('../services/payoutService');

// GET /api/payouts/weeks/:weekStart
// The week's payout status, what the next run would change, and its run history.
async function getWeekPayout(req, res, next) {
    try {
        const payout = await payoutService.getWeekPayout({ weekStart: req.params.weekStart });

        return res.status(200).json({ payout });
    } catch (error) {
        return next(error);
    }
}

// POST /api/payouts/weeks/:weekStart/run
// Trigger (or re-trigger) the week's payout.
async function triggerPayout(req, res, next) {
    try {
        const result = await payoutService.triggerPayout({ weekStart: req.params.weekStart });

        return res.status(201).json({
            message: result.run.runNumber === 1
                ? 'Payout triggered successfully'
                : `Payout re-triggered: ${result.run.updatedCount} rider(s) updated`,
            ...result
        });
    } catch (error) {
        return next(error);
    }
}

// GET /api/payouts/recent?limit=10
// The latest payout runs across all weeks.
async function getRecentPayouts(req, res, next) {
    const limit = Number(req.query.limit ?? 10);

    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
        return next(new AppError('limit must be between 1 and 50', 400));
    }

    try {
        const runs = await payoutService.getRecentPayouts({ limit });

        return res.status(200).json({ count: runs.length, runs });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    getWeekPayout,
    triggerPayout,
    getRecentPayouts
};
