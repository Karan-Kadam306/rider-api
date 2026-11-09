import { request } from './client';

// POST /api/auth/login — sets the session cookie and returns { user }.
export function login({ email, password }) {
    return request('/api/auth/login', { method: 'POST', body: { email, password } });
}

// POST /api/auth/logout — ends this browser's session; safe if already signed out.
export function logout() {
    return request('/api/auth/logout', { method: 'POST' });
}

// GET /api/auth/me — who is signed in; a 401 means nobody is.
export function getCurrentUser(options) {
    return request('/api/auth/me', options);
}

// Other browsers signed in as this user are signed out; this one stays signed in.
export function changePassword({ currentPassword, newPassword }) {
    return request('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
}
