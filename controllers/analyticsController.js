const analyticsService = require('../services/analyticsService');

// GET /api/analytics/team-leaders?from=YYYY-MM-DD&to=YYYY-MM-DD
async function getTeamLeaderStats(req, res, next) {
    try {
        const { from, to } = req.query;
        const stats = await analyticsService.getTeamLeaderStats({ from, to });

        return res.status(200).json(stats);
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    getTeamLeaderStats
};
