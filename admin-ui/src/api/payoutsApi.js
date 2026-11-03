import { request } from './client';

// GET /api/payouts/weeks/:weekStart — status, what the next run would change, and run history.
export async function getWeekPayout(weekStart, { signal } = {}) {
    const data = await request(`/api/payouts/weeks/${weekStart}`, { signal });
    return data.payout;
}

// POST /api/payouts/weeks/:weekStart/run — trigger or re-trigger the week's payout.
export function triggerPayout(weekStart) {
    return request(`/api/payouts/weeks/${weekStart}/run`, { method: 'POST' });
}

// GET /api/payouts/recent?limit=10 — latest runs across all weeks.
export async function getRecentPayouts({ limit } = {}, { signal } = {}) {
    const data = await request('/api/payouts/recent', { params: { limit }, signal });
    return data.runs;
}
