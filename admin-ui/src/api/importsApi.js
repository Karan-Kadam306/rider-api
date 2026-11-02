import { request } from './client';

// GET /api/imports/types
export function getImportTypes({ signal } = {}) {
    return request('/api/imports/types', { signal });
}

// GET /api/imports/summary
export function getImportSummary({ signal } = {}) {
    return request('/api/imports/summary', { signal });
}

// GET /api/imports?type=daily_km&status=Partial&page=1&limit=20
export function getImports({ type, status, page, limit } = {}, { signal } = {}) {
    return request('/api/imports', { params: { type, status, page, limit }, signal });
}

// GET /api/imports/:importId
export function getImport(importId, { signal } = {}) {
    return request(`/api/imports/${importId}`, { signal });
}

// POST /api/imports (multipart: type, workDate, file)
export function uploadImport({ type, workDate, file }) {
    const form = new FormData();
    form.append('type', type);

    if (workDate) {
        form.append('workDate', workDate);
    }

    form.append('file', file);

    return request('/api/imports', { method: 'POST', body: form });
}
