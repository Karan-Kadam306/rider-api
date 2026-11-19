const AppError = require('../errors/AppError');
const teamLeaderService = require('../services/teamLeaderService');

// Everything a team leader may call, relative to /api. Anything not listed is refused, so a new
// route stays closed to team leaders until it is added here on purpose.
// riderScoped routes also need the rider to be assigned to the team leader.
const TEAM_LEADER_ROUTES = [
    { method: 'GET', pattern: /^\/tl\/riders\/?$/ },
    { method: 'GET', pattern: /^\/riders\/([^/]+)\/(profile|payouts|assignments|escalations)\/?$/, riderScoped: true }
];

function findRoute(method, path) {
    for (const route of TEAM_LEADER_ROUTES) {
        const match = route.method === method && path.match(route.pattern);

        if (match) {
            return { route, match };
        }
    }

    return null;
}

// Use after requireAuth on /api. Other roles pass straight through.
async function restrictTeamLeader(req, res, next) {
    if (req.user?.role !== 'team_leader') {
        return next();
    }

    const found = findRoute(req.method, req.path);

    if (!found) {
        return next(new AppError('Team leaders can only open their own riders', 403));
    }

    if (!found.route.riderScoped) {
        return next();
    }

    try {
        const riderId = decodeURIComponent(found.match[1]);
        const allowed = await teamLeaderService.canAccessRider({ userId: req.user.userId, riderId });

        // 404, not 403, so a team leader cannot learn which other rider IDs exist.
        return allowed ? next() : next(new AppError('Rider Not Found', 404));
    } catch (error) {
        return next(error instanceof URIError ? new AppError('Rider Not Found', 404) : error);
    }
}

module.exports = { restrictTeamLeader, TEAM_LEADER_ROUTES };
