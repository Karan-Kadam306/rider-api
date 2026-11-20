import { request } from './client';

// GET /api/analytics/team-leaders?from=YYYY-MM-DD&to=YYYY-MM-DD — one row per active team leader.
export async function getTeamLeaderStats({ from, to }, { signal } = {}) {
    const data = await request('/api/analytics/team-leaders', { params: { from, to }, signal });
    return data.teamLeaders;
}
