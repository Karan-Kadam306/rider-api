const { pool } = require('../db');
const AppError = require('../errors/AppError');
const analyticsRepository = require('../repositories/analyticsRepository');
const { todayInIst, addDays } = require('./billingService');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// The Analytics page asks for at most 12 weeks; a year is plenty of headroom.
const MAX_RANGE_DAYS = 366;

// A real calendar day: 2026-02-30 and 2026-13-01 match the pattern but are not.
function isValidDate(value) {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Each team leader's calls, promises, recovered dues and riders owing, for the dates from–to.
async function getTeamLeaderStats({ from, to }) {
    if (!isValidDate(from) || !isValidDate(to) || from > to || to > addDays(from, MAX_RANGE_DAYS)) {
        throw new AppError(`from and to must be dates (YYYY-MM-DD), from first, at most ${MAX_RANGE_DAYS} days apart`, 400);
    }

    const rows = await analyticsRepository.findTeamLeaderStats(pool, { from, to, today: todayInIst() });

    return {
        from,
        to,
        teamLeaders: rows.map(row => ({
            userId: row.user_id,
            name: row.name,
            riders: row.riders,
            calls: row.calls,
            ridersCalled: row.riders_called,
            promises: { made: row.promises_made, kept: row.promises_kept, broken: row.promises_broken },
            recovered: { count: row.recovered_count, amount: row.recovered_amount },
            owingNow: { count: row.owing_count, amount: row.owing_amount }
        }))
    };
}

module.exports = {
    getTeamLeaderStats
};
