import { request } from './client';

const base = applicationId => `/api/onboarding/applications/${applicationId}`;

// GET /api/onboarding/applications — one tab's page of applications, with every tab's count.
export function getApplications(params, { signal } = {}) {
    return request('/api/onboarding/applications', { params, signal });
}

// GET /api/onboarding/applications/counts — tab counts only, for when a rider tab is open.
export async function getApplicationCounts(params, { signal } = {}) {
    const data = await request('/api/onboarding/applications/counts', { params, signal });
    return data.counts;
}

// GET /api/onboarding/applications/:applicationId — everything the review page shows.
export async function getApplication(applicationId, { signal } = {}) {
    const data = await request(base(applicationId), { signal });
    return data.application;
}

// The URL of one uploaded file, for <img> and links. The session cookie goes with it.
export function applicationFileUrl(applicationId, fileId) {
    return `${base(applicationId)}/files/${fileId}`;
}

// PATCH …/items/:item — item is a document type or 'bank'. A rejection needs a reason.
export async function reviewItem(applicationId, item, { status, reason }) {
    const data = await request(`${base(applicationId)}/items/${item}`, { method: 'PATCH', body: { status, reason } });
    return data.application;
}

export async function holdApplication(applicationId, reason) {
    const data = await request(`${base(applicationId)}/hold`, { method: 'POST', body: { reason } });
    return data.application;
}

export async function releaseApplication(applicationId) {
    const data = await request(`${base(applicationId)}/release`, { method: 'POST' });
    return data.application;
}

// Steps of rejected items are always sent back too.
export async function requestChanges(applicationId, { steps, note }) {
    const data = await request(`${base(applicationId)}/request-changes`, { method: 'POST', body: { steps, note } });
    return data.application;
}

export async function rejectApplication(applicationId, reason) {
    const data = await request(`${base(applicationId)}/reject`, { method: 'POST', body: { reason } });
    return data.application;
}

// Creates the rider: { hubId, teamLeaderIds, mappings: [{ partnerId, partnerRiderId }], note }.
export async function approveApplication(applicationId, body) {
    const data = await request(`${base(applicationId)}/approve`, { method: 'POST', body });
    return data.application;
}

// Admins only: the rider paid but the payment provider never confirmed it.
// { purpose: 'Deposit' | 'PrepaidPack', reference, note }.
export async function markPaid(applicationId, body) {
    const data = await request(`${base(applicationId)}/mark-paid`, { method: 'POST', body });
    return data.application;
}

// GET /api/onboarding/approval-options — active hubs, team leaders and partners.
export function getApprovalOptions({ signal } = {}) {
    return request('/api/onboarding/approval-options', { signal });
}
