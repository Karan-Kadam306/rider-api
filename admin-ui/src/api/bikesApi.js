import { request } from './client';

// GET /api/bikes
export function getBikes(params, { signal } = {}) {
    return request('/api/bikes', { params, signal });
}

// GET /api/bikes/:bikeId
export async function getBike(bikeId, { signal } = {}) {
    const data = await request(`/api/bikes/${bikeId}`, { signal });
    return data.bike;
}

// GET /api/bikes/summary
export async function getBikeSummary({ signal } = {}) {
    const data = await request('/api/bikes/summary', { signal });
    return data.summary;
}

// PATCH /api/bikes/:bikeId/status
export function updateBikeStatus(bikeId, status) {
    return request(`/api/bikes/${bikeId}/status`, { method: 'PATCH', body: { status } });
}
