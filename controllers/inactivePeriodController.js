const inactivePeriodService = require('../services/inactivePeriodService');

// GET /api/riders/:riderId/inactive-periods
// List a rider's inactive periods, latest first.
async function listPeriods(req, res, next) {
    try {
        const periods = await inactivePeriodService.listPeriods({ riderId: req.params.riderId });

        return res.status(200).json({ count: periods.length, periods });
    } catch (error) {
        return next(error);
    }
}

// POST /api/riders/:riderId/inactive-periods
// Body: { startDate, endDate }. The period starts as Pending.
async function createPeriod(req, res, next) {
    const { startDate, endDate } = req.body ?? {};

    try {
        const period = await inactivePeriodService.createPeriod({
            riderId: req.params.riderId,
            startDate,
            endDate
        });

        return res.status(201).json({ message: 'Inactive period added', period });
    } catch (error) {
        return next(error);
    }
}

// PATCH /api/riders/:riderId/inactive-periods/:periodId/approve
// Approve a period so its days are not charged rental.
async function approvePeriod(req, res, next) {
    try {
        const period = await inactivePeriodService.approvePeriod({
            riderId: req.params.riderId,
            periodId: req.params.periodId
        });

        return res.status(200).json({ message: 'Inactive period approved', period });
    } catch (error) {
        return next(error);
    }
}

// DELETE /api/riders/:riderId/inactive-periods/:periodId
// Remove a period; its days are charged again if a bike was assigned.
async function deletePeriod(req, res, next) {
    try {
        const period = await inactivePeriodService.deletePeriod({
            riderId: req.params.riderId,
            periodId: req.params.periodId
        });

        return res.status(200).json({ message: 'Inactive period removed', period });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    listPeriods,
    createPeriod,
    approvePeriod,
    deletePeriod
};
