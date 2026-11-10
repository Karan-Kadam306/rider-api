import { request } from './client';

// GET /api/partners
export async function getPartners({ signal } = {}) {
    const data = await request('/api/partners', { signal });
    return data.partners;
}

// GET /api/partner-mappings?view=unmapped|mapped&status=&search=&page=&limit=
// Returns { counts, pagination, riders }.
export function getPartnerMappings(params, { signal } = {}) {
    return request('/api/partner-mappings', { params, signal });
}

// PUT /api/partner-mappings/riders/:riderId — mappings is the rider's full list of { partnerId, partnerRiderId }.
export function saveRiderMappings(riderId, mappings) {
    return request(`/api/partner-mappings/riders/${encodeURIComponent(riderId)}`, {
        method: 'PUT',
        body: { mappings }
    });
}
