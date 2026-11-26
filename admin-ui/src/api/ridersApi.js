import { request } from './client';

// GET /api/riders (paginated, with search, status and hubId filters).
// Test riders are left out unless includeTest is true.
export function getRiders(params, { signal } = {}) {
    return request('/api/riders', { params, signal });
}

// GET /api/riders/:riderId
export async function getRider(riderId, { signal } = {}) {
    const data = await request(`/api/riders/${encodeURIComponent(riderId)}`, { signal });
    return data.rider;
}

// GET /api/riders/summary — test riders are counted only when includeTest is true, as in the list.
export async function getRiderSummary({ includeTest, signal } = {}) {
    const data = await request('/api/riders/summary', { params: { includeTest }, signal });
    return data.summary;
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

// GET /api/riders/:riderId/profile — rider, current bike, partner IDs, this week's bill,
// outstanding balance and open escalations, for the rider detail page.
export function getRiderProfile(riderId, { signal } = {}) {
    return request(`/api/riders/${encodeURIComponent(riderId)}/profile`, { signal });
}

// GET /api/riders/:riderId/payouts (paginated, newest week first)
export function getRiderPayouts(riderId, params, { signal } = {}) {
    return request(`/api/riders/${encodeURIComponent(riderId)}/payouts`, { params, signal });
}

// GET /api/riders/:riderId/assignments (paginated, newest first)
export function getRiderAssignments(riderId, params, { signal } = {}) {
    return request(`/api/riders/${encodeURIComponent(riderId)}/assignments`, { params, signal });
}
