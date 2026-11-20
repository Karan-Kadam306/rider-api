const followUpService = require('../services/followUpService');

// GET /api/riders/:riderId/follow-ups?page=&limit=
async function listFollowUps(req, res, next) {
    try {
        const { page, limit } = req.query;
        const result = await followUpService.listFollowUps({ riderId: req.params.riderId, page, limit });

        return res.status(200).json(result);
    } catch (error) {
        return next(error);
    }
}

// POST /api/riders/:riderId/follow-ups
// Body: { reason, outcome, note, promiseDate?, promiseAmount?, escalationId? }
async function logFollowUp(req, res, next) {
    try {
        const { reason, outcome, note, promiseDate, promiseAmount, escalationId } = req.body ?? {};
        const followUp = await followUpService.logFollowUp({
            riderId: req.params.riderId,
            userId: req.user.userId,
            reason,
            outcome,
            note,
            promiseDate,
            promiseAmount,
            escalationId
        });

        return res.status(201).json({ message: 'Follow-up logged', followUp });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    listFollowUps,
    logFollowUp
};
