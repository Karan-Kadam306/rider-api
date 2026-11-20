import { request } from './client';

function riderPath(riderId) {
    return `/api/riders/${encodeURIComponent(riderId)}/team-leaders`;
}

// GET /api/tl/riders?search=&page=&limit= — the signed-in team leader's riders, owing riders first.
export function getMyRiders(params, { signal } = {}) {
    return request('/api/tl/riders', { params, signal });
}

// GET /api/tl/queue — the signed-in team leader's critical riders, worst first. Returns { riders }.
export function getMyQueue({ signal } = {}) {
    return request('/api/tl/queue', { signal });
}

// GET /api/users/team-leaders — admins: active team leaders with their rider counts.
export async function getTeamLeaders({ signal } = {}) {
    const data = await request('/api/users/team-leaders', { signal });
    return data.teamLeaders;
}

// GET /api/riders/:riderId/team-leaders
export async function getRiderTeamLeaders(riderId, { signal } = {}) {
    const data = await request(riderPath(riderId), { signal });
    return data.teamLeaders;
}

// POST /api/riders/:riderId/team-leaders — admins. Returns the rider's updated list.
export async function assignTeamLeader(riderId, userId) {
    const data = await request(riderPath(riderId), { method: 'POST', body: { userId } });
    return data.teamLeaders;
}

// DELETE /api/riders/:riderId/team-leaders/:userId — admins. Returns the rider's updated list.
export async function removeTeamLeader(riderId, userId) {
    const data = await request(`${riderPath(riderId)}/${userId}`, { method: 'DELETE' });
    return data.teamLeaders;
}
