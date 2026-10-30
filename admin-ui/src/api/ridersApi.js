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

// DELETE /api/riders/:riderId — terminates the rider and returns their bike, if any.
export function terminateRider(riderId) {
    return request(`/api/riders/${encodeURIComponent(riderId)}`, { method: 'DELETE' });
}
