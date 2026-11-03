import { request } from './client';

// GET /api/riders (paginated, with search and status filters)
export function getRiders(params, { signal } = {}) {
    return request('/api/riders', { params, signal });
}

// GET /api/riders/:riderId
export async function getRider(riderId, { signal } = {}) {
    const data = await request(`/api/riders/${encodeURIComponent(riderId)}`, { signal });
    return data.rider;
}

// GET /api/riders/summary
export async function getRiderSummary({ signal } = {}) {
    const data = await request('/api/riders/summary', { signal });
    return data.summary;
}

// POST /api/riders
export async function createRider({ rider_id, name, phone }) {
    const data = await request('/api/riders', { method: 'POST', body: { rider_id, name, phone } });
    return data.rider;
}

// PUT /api/riders/:riderId (name, phone and status are all required)
export async function updateRider(riderId, { name, phone, status }) {
    const data = await request(`/api/riders/${encodeURIComponent(riderId)}`, {
        method: 'PUT',
        body: { name, phone, status }
    });
    return data.rider;
}

// GET /api/riders/:riderId/inactive-periods
export async function getInactivePeriods(riderId, { signal } = {}) {
    const data = await request(`/api/riders/${encodeURIComponent(riderId)}/inactive-periods`, { signal });
    return data.periods;
}

// POST /api/riders/:riderId/inactive-periods — starts as Pending (still charged).
export async function addInactivePeriod(riderId, { startDate, endDate }) {
    const data = await request(`/api/riders/${encodeURIComponent(riderId)}/inactive-periods`, {
        method: 'POST',
        body: { startDate, endDate }
    });
    return data.period;
}

// PATCH /api/riders/:riderId/inactive-periods/:periodId/approve — its days stop being charged.
export async function approveInactivePeriod(riderId, periodId) {
    const data = await request(
        `/api/riders/${encodeURIComponent(riderId)}/inactive-periods/${periodId}/approve`,
        { method: 'PATCH' }
    );
    return data.period;
}

// DELETE /api/riders/:riderId/inactive-periods/:periodId
export function removeInactivePeriod(riderId, periodId) {
    return request(`/api/riders/${encodeURIComponent(riderId)}/inactive-periods/${periodId}`, {
        method: 'DELETE'
    });
}

// DELETE /api/riders/:riderId — terminates the rider and returns their bike, if any.
export function terminateRider(riderId) {
    return request(`/api/riders/${encodeURIComponent(riderId)}`, { method: 'DELETE' });
}
