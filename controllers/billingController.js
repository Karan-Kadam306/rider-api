const billingService = require('../services/billingService');

// GET /api/billing/riders/:riderId?weekStart=YYYY-MM-DD
async function getRiderBill(req, res, next) {
    try {
        const bill = await billingService.getRiderBill({
            riderId: req.params.riderId,
            weekStart: req.query.weekStart
        });

        return res.status(200).json({ bill });
    } catch (error) {
        return next(error);
    }
}

// GET /api/billing/summary?weekStart=YYYY-MM-DD
async function getWeeklyBillingSummary(req, res, next) {
    try {
        const summary = await billingService.getWeeklyBillingSummary({
            weekStart: req.query.weekStart
        });

        return res.status(200).json({ summary });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    getRiderBill,
    getWeeklyBillingSummary
};
