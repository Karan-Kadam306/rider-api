import { request } from './client';

// GET /api/daily-km?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD&status=Needs Review&search=&page=1&limit=20
export function getDailyKmRecords({ fromDate, toDate, status, search, page, limit } = {}, { signal } = {}) {
    return request('/api/daily-km', { params: { fromDate, toDate, status, search, page, limit }, signal });
}

// POST /api/daily-km/validate — every matched Pending record in the range becomes Validated.
export function validateDailyKm({ fromDate, toDate }) {
    return request('/api/daily-km/validate', { method: 'POST', body: { fromDate, toDate } });
}

// GET /api/daily-km/candidates?bikeId=12&usageDate=YYYY-MM-DD — riders who held the bike that day.
export function getRiderCandidates({ bikeId, usageDate }, { signal } = {}) {
    return request('/api/daily-km/candidates', { params: { bikeId, usageDate }, signal });
}

// PATCH /api/daily-km/:recordId/resolve
export function resolveDailyKmRecord(recordId, { riderId, bikeId, reason }) {
    return request(`/api/daily-km/${recordId}/resolve`, {
        method: 'PATCH',
        body: { riderId, bikeId, reason }
    });
}
