import { download, request } from './client';

// GET /api/billing/bills?weekStart=YYYY-MM-DD&view=needsReview&search=&page=1&limit=20
export function getBills({ weekStart, view, search, page, limit }, { signal } = {}) {
    return request('/api/billing/bills', { params: { weekStart, view, search, page, limit }, signal });
}

// GET /api/billing/bills/export — saves the CSV; same view and search as the table.
export function exportBills({ weekStart, view, search }) {
    return download('/api/billing/bills/export', {
        params: { weekStart, view, search },
        fallbackName: `billing-${weekStart}.csv`
    });
}

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
