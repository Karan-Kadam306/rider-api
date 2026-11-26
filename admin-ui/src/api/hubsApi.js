import { request } from './client';

// GET /api/hubs — every hub with its bike counts, active hubs first.
export async function getHubs({ signal } = {}) {
    const data = await request('/api/hubs', { signal });
    return data.hubs;
}

// POST /api/hubs — admins only. contactPhone and managerName are optional.
export async function createHub({ code, name, city, address, contactPhone, managerName }) {
    const data = await request('/api/hubs', {
        method: 'POST',
        body: { code, name, city, address, contactPhone, managerName }
    });
    return data.hub;
}

// PATCH /api/hubs/:hubId — admins only. Any of { code, name, city, address, contactPhone, managerName, isActive }.
export async function updateHub(hubId, changes) {
    const data = await request(`/api/hubs/${hubId}`, { method: 'PATCH', body: changes });
    return data.hub;
}
