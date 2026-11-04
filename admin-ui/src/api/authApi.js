import { request } from './client';

export function login({ email, password }) {
    return request('/api/auth/login', { method: 'POST', body: { email, password } });
}

export function logout() {
    return request('/api/auth/logout', { method: 'POST' });
}

export function getCurrentUser(options) {
    return request('/api/auth/me', options);
}

// Other browsers signed in as this user are signed out; this one stays signed in.
export function changePassword({ currentPassword, newPassword }) {
    return request('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
}
