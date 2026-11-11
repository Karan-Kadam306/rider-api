const partnerEarningsService = require('../services/partnerEarningsService');

// GET /api/partner-earnings/pending?partnerId=&search=&page=&limit=
async function listPendingEarnings(req, res, next) {
    try {
        const { partnerId, search, page, limit } = req.query;
        const result = await partnerEarningsService.listPendingEarnings({ partnerId, search, page, limit });

        return res.status(200).json(result);
    } catch (error) {
        return next(error);
    }
}

// POST /api/partner-earnings/pending/resolve
// Body: { partnerId, partnerRiderId, riderId } — maps the ID to the rider and matches its pending earnings.
async function resolvePendingEarnings(req, res, next) {
    try {
        const { partnerId, partnerRiderId, riderId } = req.body ?? {};
        const result = await partnerEarningsService.resolvePendingEarnings({
            actingUserId: req.user.userId,
            partnerId,
            partnerRiderId,
            riderId
        });

        return res.status(200).json({ message: 'Earnings matched', ...result });
    } catch (error) {
        return next(error);
    }
}

// POST /api/partner-earnings/pending/dismiss
// Body: { partnerId, partnerRiderId, reason }
async function dismissPendingEarnings(req, res, next) {
    try {
        const { partnerId, partnerRiderId, reason } = req.body ?? {};
        const result = await partnerEarningsService.dismissPendingEarnings({
            actingUserId: req.user.userId,
            partnerId,
            partnerRiderId,
            reason
        });

        return res.status(200).json({ message: 'Earnings dismissed', ...result });
    } catch (error) {
        return next(error);
    }
}

// GET /api/partner-earnings/move-preview?partnerId=&partnerRiderId=&riderId=&fromDate=&toDate=
async function previewMove(req, res, next) {
    try {
        const { partnerId, partnerRiderId, riderId, fromDate, toDate } = req.query;
        const result = await partnerEarningsService.previewMove({ partnerId, partnerRiderId, riderId, fromDate, toDate });

        return res.status(200).json(result);
    } catch (error) {
        return next(error);
    }
}

// POST /api/partner-earnings/move
// Body: { partnerId, partnerRiderId, riderId, fromDate, toDate } — riderId must hold the ID now.
async function moveEarnings(req, res, next) {
    try {
        const { partnerId, partnerRiderId, riderId, fromDate, toDate } = req.body ?? {};
        const result = await partnerEarningsService.moveEarnings({
            actingUserId: req.user.userId,
            partnerId,
            partnerRiderId,
            riderId,
            fromDate,
            toDate
        });

        return res.status(200).json({ message: 'Earnings moved', ...result });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    listPendingEarnings,
    resolvePendingEarnings,
    dismissPendingEarnings,
    previewMove,
    moveEarnings
};
