import { request } from './client';

// GET /api/hubs — every hub with its bike counts, active hubs first.
export async function getHubs({ signal } = {}) {
    const data = await request('/api/hubs', { signal });
    return data.hubs;
}

// POST /api/hubs — admins only. contactPhone is optional.
export async function createHub({ name, city, address, contactPhone }) {
    const data = await request('/api/hubs', { method: 'POST', body: { name, city, address, contactPhone } });
    return data.hub;
}

// PATCH /api/hubs/:hubId — admins only. Any of { name, city, address, contactPhone, isActive }.
export async function updateHub(hubId, changes) {
    const data = await request(`/api/hubs/${hubId}`, { method: 'PATCH', body: changes });
    return data.hub;
}
