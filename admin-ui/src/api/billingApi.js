import { request } from './client';

// GET /api/billing/summary?weekStart=YYYY-MM-DD
export async function getBillingSummary(weekStart, { signal } = {}) {
    const data = await request('/api/billing/summary', { params: { weekStart }, signal });
    return data.summary;
}

// GET /api/billing/riders/:riderId?weekStart=YYYY-MM-DD
export async function getRiderBill(riderId, weekStart, { signal } = {}) {
    const data = await request(`/api/billing/riders/${encodeURIComponent(riderId)}`, {
        params: { weekStart },
        signal
    });
    return data.bill;
}

// POST /api/billing/weeks/:weekStart/close
export async function closeWeek(weekStart) {
    const data = await request(`/api/billing/weeks/${weekStart}/close`, { method: 'POST' });
    return data.closure;
}
