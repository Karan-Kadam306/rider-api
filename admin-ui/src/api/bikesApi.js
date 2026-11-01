import { request } from './client';

// Identifies this app to the assignment endpoint's idempotency check.
const CLIENT_ID = 'admin-ui';

function bikePath(bikeId) {
    return `/api/bikes/${encodeURIComponent(bikeId)}`;
}

// GET /api/bikes (paginated, with optional status and search filters)
export function getBikes(params, { signal } = {}) {
    return request('/api/bikes', { params, signal });
}

// GET /api/bikes/:bikeId
export async function getBike(bikeId, { signal } = {}) {
    const data = await request(bikePath(bikeId), { signal });
    return data.bike;
}

// GET /api/bikes/summary
export async function getBikeSummary({ signal } = {}) {
    const data = await request('/api/bikes/summary', { signal });
    return data.summary;
}

// POST /api/bikes (registrationNumber is optional)
export async function createBike({ registrationNumber, chassisNumber }) {
    const data = await request('/api/bikes', {
        method: 'POST',
        body: { registrationNumber: registrationNumber || undefined, chassisNumber }
    });
    return data.bike;
}

// PATCH /api/bikes/:bikeId/status (Available or Maintenance only)
export function updateBikeStatus(bikeId, status) {
    return request(`${bikePath(bikeId)}/status`, { method: 'PATCH', body: { status } });
}

// POST /api/bike-assignments
// Reuse the same idempotencyKey when retrying, so a bike is never assigned twice.
export function assignBike({ bikeId, riderId, idempotencyKey }) {
    return request('/api/bike-assignments', {
        method: 'POST',
        body: { bikeId, riderId, clientId: CLIENT_ID },
        headers: { 'Idempotency-Key': idempotencyKey }
    });
}

// POST /api/bikes/:bikeId/return
export function returnBike(bikeId) {
    return request(`${bikePath(bikeId)}/return`, { method: 'POST' });
}

// GET /api/bikes/:bikeId/assignments (paginated)
export function getBikeHistory(bikeId, params, { signal } = {}) {
    return request(`${bikePath(bikeId)}/assignments`, { params, signal });
}
