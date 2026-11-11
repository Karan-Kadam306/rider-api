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

// GET /api/partner-earnings/pending?partnerId=&search=&page=&limit=
// Returns { pagination, groups } — one group per partner + ID.
export function getPendingEarnings(params, { signal } = {}) {
    return request('/api/partner-earnings/pending', { params, signal });
}

// POST /api/partner-earnings/pending/resolve — maps the ID to the rider and matches its pending earnings.
export function resolvePendingEarnings({ partnerId, partnerRiderId, riderId }) {
    return request('/api/partner-earnings/pending/resolve', {
        method: 'POST',
        body: { partnerId, partnerRiderId, riderId }
    });
}

// POST /api/partner-earnings/pending/dismiss
export function dismissPendingEarnings({ partnerId, partnerRiderId, reason }) {
    return request('/api/partner-earnings/pending/dismiss', {
        method: 'POST',
        body: { partnerId, partnerRiderId, reason }
    });
}
