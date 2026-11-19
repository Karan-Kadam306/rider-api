const teamLeaderService = require('../services/teamLeaderService');

// GET /api/users/team-leaders — admins: active team leaders with their rider counts.
async function listTeamLeaders(req, res, next) {
    try {
        const teamLeaders = await teamLeaderService.listTeamLeaders();
        return res.status(200).json({ teamLeaders });
    } catch (error) {
        return next(error);
    }
}

// GET /api/riders/:riderId/team-leaders
async function getRiderTeamLeaders(req, res, next) {
    try {
        const teamLeaders = await teamLeaderService.getRiderTeamLeaders(req.params.riderId);
        return res.status(200).json({ teamLeaders });
    } catch (error) {
        return next(error);
    }
}

// POST /api/riders/:riderId/team-leaders — admins. Body: { userId }
async function assignTeamLeader(req, res, next) {
    try {
        const teamLeaders = await teamLeaderService.assignTeamLeader({
            riderId: req.params.riderId,
            userId: req.body?.userId,
            actingUserId: req.user.userId
        });

        return res.status(201).json({ message: 'Team leader assigned', teamLeaders });
    } catch (error) {
        return next(error);
    }
}

// DELETE /api/riders/:riderId/team-leaders/:userId — admins.
async function removeTeamLeader(req, res, next) {
    try {
        const teamLeaders = await teamLeaderService.removeTeamLeader({
            riderId: req.params.riderId,
            userId: req.params.userId,
            actingUserId: req.user.userId
        });

        return res.status(200).json({ message: 'Team leader removed', teamLeaders });
    } catch (error) {
        return next(error);
    }
}

// GET /api/tl/riders?search=&page=&limit= — the signed-in team leader's riders.
async function listMyRiders(req, res, next) {
    try {
        const { search, page, limit } = req.query;
        const result = await teamLeaderService.listMyRiders({ userId: req.user.userId, search, page, limit });

        return res.status(200).json(result);
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    listTeamLeaders,
    getRiderTeamLeaders,
    assignTeamLeader,
    removeTeamLeader,
    listMyRiders
};
