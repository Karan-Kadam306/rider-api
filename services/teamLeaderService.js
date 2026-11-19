const { pool, inTransaction } = require('../db');
const AppError = require('../errors/AppError');
const riderRepository = require('../repositories/riderRepository');
const teamLeaderRepository = require('../repositories/teamLeaderRepository');

function parseUserId(userId) {
    const id = Number(userId);

    if (!Number.isSafeInteger(id) || id < 1) {
        throw new AppError('userId must be a positive integer', 400);
    }

    return id;
}

function toPagination(page, limit) {
    page = Number(page);
    limit = Number(limit);

    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new AppError('Page must be a positive integer and the page limit must be 1 to 100', 400);
    }

    return { page, limit, offset: (page - 1) * limit };
}

async function findRiderOrThrow(riderId) {
    const rider = await riderRepository.findById(riderId);

    if (!rider) {
        throw new AppError('Rider Not Found', 404);
    }

    return rider;
}

function toTeamLeader(row) {
    return {
        userId: row.user_id,
        name: row.name,
        email: row.email,
        ...(row.assigned_at !== undefined ? { assignedAt: row.assigned_at, isActive: row.is_active } : {}),
        ...(row.rider_count !== undefined ? { riderCount: row.rider_count } : {})
    };
}

// Active team leaders, for the picker on the rider page.
async function listTeamLeaders() {
    const rows = await teamLeaderRepository.findTeamLeaders(pool);
    return rows.map(toTeamLeader);
}

async function getRiderTeamLeaders(riderId) {
    await findRiderOrThrow(riderId);
    const rows = await teamLeaderRepository.findRiderTeamLeaders(pool, { riderId });
    return rows.map(toTeamLeader);
}

// Give the rider one more team leader. A rider can have several; each holds them once at a time.
async function assignTeamLeader({ riderId, userId, actingUserId }) {
    const leaderId = parseUserId(userId);
    const rider = await findRiderOrThrow(riderId);

    if (rider.status === 'Terminated') {
        throw new AppError('A terminated rider cannot get a team leader', 409);
    }

    await inTransaction(async client => {
        const leader = await teamLeaderRepository.findUser(client, { userId: leaderId });

        if (!leader || leader.role !== 'team_leader' || !leader.is_active) {
            throw new AppError('Choose an active team leader', 400);
        }

        const added = await teamLeaderRepository.insertLink(client, { userId: leaderId, riderId, assignedBy: actingUserId });

        if (!added) {
            throw new AppError(`${leader.name} is already this rider's team leader`, 409);
        }
    });

    return getRiderTeamLeaders(riderId);
}

// The link is kept as history, so who held the rider and when stays visible.
async function removeTeamLeader({ riderId, userId, actingUserId }) {
    const leaderId = parseUserId(userId);
    await findRiderOrThrow(riderId);

    const removed = await teamLeaderRepository.removeLink(pool, { userId: leaderId, riderId, removedBy: actingUserId });

    if (!removed) {
        throw new AppError('This user is not one of the rider\'s team leaders', 404);
    }

    return getRiderTeamLeaders(riderId);
}

// Whether a team leader may open this rider. Used by restrictTeamLeader on every rider route.
function canAccessRider({ userId, riderId }) {
    return teamLeaderRepository.isAssigned(pool, { userId, riderId });
}

// The signed-in team leader's own riders, owing riders first.
async function listMyRiders({ userId, search, page = 1, limit = 20 }) {
    const pagination = toPagination(page, limit);
    const term = typeof search === 'string' && search.trim() ? `%${search.trim()}%` : null;

    const [rows, totalRecords] = await Promise.all([
        teamLeaderRepository.findMyRiders(pool, { userId, search: term, limit: pagination.limit, offset: pagination.offset }),
        teamLeaderRepository.countMyRiders(pool, { userId, search: term })
    ]);

    return {
        pagination: { ...pagination, totalRecords, totalPages: Math.ceil(totalRecords / pagination.limit) },
        riders: rows.map(row => ({
            riderId: row.rider_id,
            name: row.name,
            phone: row.phone,
            status: row.status,
            assignedAt: row.assigned_at,
            currentBike: row.bike_id
                ? { bikeId: row.bike_id, chassisNumber: row.chassis_number, registrationNumber: row.registration_number }
                : null,
            lastPaidWeek: row.last_paid_week,
            lastNetPayout: row.last_net_payout,
            openEscalations: row.open_escalations,
            openEscalationAmount: row.open_escalation_amount
        }))
    };
}

module.exports = {
    listTeamLeaders,
    getRiderTeamLeaders,
    assignTeamLeader,
    removeTeamLeader,
    canAccessRider,
    listMyRiders
};
