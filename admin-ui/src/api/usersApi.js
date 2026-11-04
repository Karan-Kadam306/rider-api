import { request } from './client';

// GET /api/users?status=active|inactive&search= — admins only. Returns { users, counts }.
export function getUsers(params, { signal } = {}) {
    return request('/api/users', { params, signal });
}

// POST /api/users
export async function createUser({ email, name, role, password }) {
    const data = await request('/api/users', { method: 'POST', body: { email, name, role, password } });
    return data.user;
}

// PATCH /api/users/:userId — any of { name, role, isActive }.
export async function updateUser(userId, changes) {
    const data = await request(`/api/users/${userId}`, { method: 'PATCH', body: changes });
    return data.user;
}

// POST /api/users/:userId/password — the user is signed out everywhere.
export async function resetUserPassword(userId, password) {
    const data = await request(`/api/users/${userId}/password`, { method: 'POST', body: { password } });
    return data.user;
}
