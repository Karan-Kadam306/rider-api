const dashboardService = require('../services/dashboardService');

// GET /api/dashboard?weekStart=YYYY-MM-DD
async function getDashboard(req, res, next) {
    try {
        const dashboard = await dashboardService.getDashboard({
            weekStart: req.query.weekStart
        });

        return res.status(200).json({ dashboard });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    getDashboard
};
