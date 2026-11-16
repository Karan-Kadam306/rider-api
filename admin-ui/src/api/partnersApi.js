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
// currentMappingIds are the mapping IDs the editor showed; the API refuses (409) if they changed since.
export function saveRiderMappings(riderId, mappings, currentMappingIds) {
    return request(`/api/partner-mappings/riders/${encodeURIComponent(riderId)}`, {
        method: 'PUT',
        body: { mappings, currentMappingIds }
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

// POST /api/partner-earnings/pending/dismiss — alwaysIgnore also sets the ID's future rows aside.
export function dismissPendingEarnings({ partnerId, partnerRiderId, reason, alwaysIgnore = false }) {
    return request('/api/partner-earnings/pending/dismiss', {
        method: 'POST',
        body: { partnerId, partnerRiderId, reason, alwaysIgnore }
    });
}

// GET /api/partner-earnings/row-errors?partnerId=&page=&limit=
// Returns { pagination, rowErrors } — earnings rows that failed to import and still block a payout.
export function getEarningsRowErrors(params, { signal } = {}) {
    return request('/api/partner-earnings/row-errors', { params, signal });
}

// POST /api/partner-earnings/row-errors/:errorId/dismiss
export function dismissEarningsRowError({ errorId, note }) {
    return request(`/api/partner-earnings/row-errors/${errorId}/dismiss`, {
        method: 'POST',
        body: { note }
    });
}

// GET /api/partner-earnings/move-preview — the ID's matched earnings in the dates held by other riders.
// Returns { riders: [{ riderId, riderName, entries, totalAmount }] }.
export function previewMoveEarnings(params, { signal } = {}) {
    return request('/api/partner-earnings/move-preview', { params, signal });
}

// POST /api/partner-earnings/move — gives those earnings to riderId, who must hold the ID now.
export function moveEarnings({ partnerId, partnerRiderId, riderId, fromDate, toDate }) {
    return request('/api/partner-earnings/move', {
        method: 'POST',
        body: { partnerId, partnerRiderId, riderId, fromDate, toDate }
    });
}
