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

// POST /api/billing/weeks/:weekStart/close
async function closeWeek(req, res, next) {
    try {
        const closure = await billingService.closeWeek({
            weekStart: req.params.weekStart
        });

        return res.status(201).json({
            message: 'Week closed successfully',
            closure
        });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    getRiderBill,
    getWeeklyBillingSummary,
    closeWeek
};
