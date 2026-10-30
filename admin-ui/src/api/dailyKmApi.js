import { request } from './client';

// GET /api/daily-km?usageDate=YYYY-MM-DD&status=Needs Review
export function getDailyKmRecords({ usageDate, status } = {}, { signal } = {}) {
    return request('/api/daily-km', { params: { usageDate, status }, signal });
}

// PATCH /api/daily-km/:recordId/resolve
export function resolveDailyKmRecord(recordId, { riderId, bikeId, reason }) {
    return request(`/api/daily-km/${recordId}/resolve`, {
        method: 'PATCH',
        body: { riderId, bikeId, reason }
    });
}
