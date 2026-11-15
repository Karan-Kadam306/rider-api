import { request } from './client';

// GET /api/riders/:riderId/escalations — newest first, each with its timeline.
export async function getEscalations(riderId, { signal } = {}) {
    const data = await request(`/api/riders/${encodeURIComponent(riderId)}/escalations`, { signal });
    return data.escalations;
}

// POST /api/riders/:riderId/escalations — no amount makes it a Record (no lock, no link).
export async function raiseEscalation(riderId, { reasons, amount, comment }) {
    const data = await request(`/api/riders/${encodeURIComponent(riderId)}/escalations`, {
        method: 'POST',
        body: { reasons, amount, comment }
    });
    return data.escalation;
}

// POST /api/escalations/:escalationId/mark-paid — when the payment webhook did not arrive.
export async function markEscalationPaid(escalationId, reference) {
    const data = await request(`/api/escalations/${escalationId}/mark-paid`, { method: 'POST', body: { reference } });
    return data.escalation;
}

// POST /api/escalations/:escalationId/waive
export async function waiveEscalation(escalationId, reason) {
    const data = await request(`/api/escalations/${escalationId}/waive`, { method: 'POST', body: { reason } });
    return data.escalation;
}

// POST /api/escalations/:escalationId/close — Records only.
export async function closeEscalation(escalationId, note) {
    const data = await request(`/api/escalations/${escalationId}/close`, { method: 'POST', body: { note } });
    return data.escalation;
}

// POST /api/escalations/:escalationId/retry-lock
export async function retryEscalationLock(escalationId) {
    const data = await request(`/api/escalations/${escalationId}/retry-lock`, { method: 'POST' });
    return data.escalation;
}

// GET /api/mock-pay/:token — public. What the mock rider app shows for a payment link.
export async function getMockPayment(token, { signal } = {}) {
    const data = await request(`/api/mock-pay/${encodeURIComponent(token)}`, { signal });
    return data.payment;
}

// POST /api/mock-pay/:token/swipe — public. Plays the payment provider and sends the signed webhook.
export function swipeToPay(token) {
    return request(`/api/mock-pay/${encodeURIComponent(token)}/swipe`, { method: 'POST' });
}
