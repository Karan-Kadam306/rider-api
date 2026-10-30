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
