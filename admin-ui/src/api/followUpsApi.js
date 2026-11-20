import { request } from './client';

function followUpsPath(riderId) {
    return `/api/riders/${encodeURIComponent(riderId)}/follow-ups`;
}

// GET /api/riders/:riderId/follow-ups?page=&limit= — newest first. Returns { pagination, followUps }.
export function getFollowUps(riderId, params, { signal } = {}) {
    return request(followUpsPath(riderId), { params, signal });
}

// POST /api/riders/:riderId/follow-ups
// Body: { reason, outcome, note, promiseDate?, promiseAmount?, escalationId? }. Saved follow-ups cannot be edited.
export async function logFollowUp(riderId, values) {
    const data = await request(followUpsPath(riderId), { method: 'POST', body: values });
    return data.followUp;
}
