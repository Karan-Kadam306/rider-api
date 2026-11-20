const { pool, inTransaction } = require('../db');
const AppError = require('../errors/AppError');
const riderRepository = require('../repositories/riderRepository');
const teamLeaderRepository = require('../repositories/teamLeaderRepository');
const { todayInIst, addDays } = require('./billingService');

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

// Queue rules. Severity orders the queue; a rider appears once, with every reason that applies.
const SEVERITY_ORDER = { Critical: 3, High: 2, Low: 1 };
// A rider with a money problem should be called at least this often.
const FOLLOW_UP_DUE_DAYS = 2;
// Lowest km riders flagged per team leader, but never more than half of their riders on a bike.
const LOW_KM_COUNT = 3;
const KM_WINDOW_DAYS = 7;

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
// "21 Nov" for a YYYY-MM-DD date, without any time zone shift.
const shortDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const formatDay = date => shortDate.format(new Date(`${date}T00:00:00.000Z`));

function daysSince(timestamp, now) {
    return timestamp ? (now - new Date(timestamp)) / (24 * 60 * 60 * 1000) : Infinity;
}

// The riders a team leader should act on now, worst first.
async function getMyQueue({ userId }) {
    const today = todayInIst();
    // Complete days only: today's km file may not be uploaded yet.
    const kmFrom = addDays(today, -KM_WINDOW_DAYS);
    const kmTo = addDays(today, -1);
    const rows = await teamLeaderRepository.findQueueRows(pool, { userId, kmFrom, kmTo });
    const now = Date.now();

    const withBike = rows.filter(row => row.has_bike).sort((a, b) => a.total_km - b.total_km);
    const lowKmCount = Math.min(LOW_KM_COUNT, Math.floor(withBike.length / 2));
    const lowKmIds = new Set(withBike.slice(0, lowKmCount).map(row => row.rider_id));

    const riders = [];

    for (const row of rows) {
        const reasons = [];
        const owes = row.open_money_escalations > 0 || row.last_net_payout < 0;

        if (owes && row.promise_date && row.promise_date < today) {
            const amount = row.promise_amount === null ? '' : ` ${inr.format(row.promise_amount)}`;
            reasons.push({ type: 'promiseBroken', severity: 'Critical', label: `Promised to pay${amount} by ${formatDay(row.promise_date)}, not paid` });
        }

        if (row.open_money_escalations > 0) {
            reasons.push({
                type: 'openEscalation',
                severity: 'Critical',
                label: `${row.locked ? 'Bike locked: ' : ''}open escalation of ${inr.format(row.open_money_amount)}`
            });
        }

        if (row.last_net_payout < 0) {
            reasons.push({ type: 'negativePayout', severity: 'High', label: `Owes ${inr.format(-row.last_net_payout)} from the last payout` });
        }

        if (lowKmIds.has(row.rider_id)) {
            reasons.push({ type: 'lowKm', severity: 'Low', label: `Lowest km: ${Math.round(row.total_km)} km in the last ${KM_WINDOW_DAYS} days` });
        }

        if (!reasons.length) {
            continue;
        }

        const severity = reasons.reduce(
            (worst, reason) => (SEVERITY_ORDER[reason.severity] > SEVERITY_ORDER[worst] ? reason.severity : worst),
            'Low'
        );

        riders.push({
            riderId: row.rider_id,
            name: row.name,
            phone: row.phone,
            status: row.status,
            severity,
            reasons,
            lastFollowUpAt: row.last_follow_up_at,
            // Money problems need a call every few days; low km alone does not.
            followUpDue: severity !== 'Low' && daysSince(row.last_follow_up_at, now) >= FOLLOW_UP_DUE_DAYS,
            activePromise: row.promise_date && row.promise_date >= today
                ? { promiseDate: row.promise_date, promiseAmount: row.promise_amount }
                : null
        });
    }

    riders.sort((a, b) =>
        SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
        Number(b.followUpDue) - Number(a.followUpDue) ||
        a.name.localeCompare(b.name));

    return { riders };
}

module.exports = {
    getMyQueue,
    listTeamLeaders,
    getRiderTeamLeaders,
    assignTeamLeader,
    removeTeamLeader,
    canAccessRider,
    listMyRiders
};
