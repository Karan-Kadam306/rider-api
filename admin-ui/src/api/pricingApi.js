import { request } from './client';

// GET /api/pricing — current postpaid rate and deposit, their history (newest first) and the prepaid packs.
export function getPricing({ signal } = {}) {
    return request('/api/pricing', { signal });
}

// POST /api/pricing/postpaid-rates — admins only.
export async function addPostpaidRate({ rentalPerDay, energyPerKm, effectiveFrom }) {
    const data = await request('/api/pricing/postpaid-rates', {
        method: 'POST',
        body: { rentalPerDay, energyPerKm, effectiveFrom }
    });
    return data.rate;
}

// DELETE /api/pricing/postpaid-rates/:rateId — only a rate that has not started.
export function removePostpaidRate(rateId) {
    return request(`/api/pricing/postpaid-rates/${rateId}`, { method: 'DELETE' });
}

// POST /api/pricing/deposits — admins only.
export async function addDepositAmount({ amount, effectiveFrom }) {
    const data = await request('/api/pricing/deposits', { method: 'POST', body: { amount, effectiveFrom } });
    return data.deposit;
}

// DELETE /api/pricing/deposits/:depositId — only an amount that has not started.
export function removeDepositAmount(depositId) {
    return request(`/api/pricing/deposits/${depositId}`, { method: 'DELETE' });
}

// POST /api/pricing/packs — admins only. validityDays is for top-ups; weekly packs last 7 days.
export async function createPrepaidPack({ kind, name, price, kmIncluded, validityDays }) {
    const data = await request('/api/pricing/packs', {
        method: 'POST',
        body: { kind, name, price, kmIncluded, validityDays }
    });
    return data.pack;
}

// PATCH /api/pricing/packs/:packId — any of { name, price, kmIncluded, validityDays, isActive }.
export async function updatePrepaidPack(packId, changes) {
    const data = await request(`/api/pricing/packs/${packId}`, { method: 'PATCH', body: changes });
    return data.pack;
}
