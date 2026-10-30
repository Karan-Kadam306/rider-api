import { request } from './client';

// GET /api/dashboard?weekStart=YYYY-MM-DD
export async function getDashboard(weekStart, { signal } = {}) {
    const data = await request('/api/dashboard', { params: { weekStart }, signal });
    return data.dashboard;
}
