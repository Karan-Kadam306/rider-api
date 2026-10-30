const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// Error thrown for any failed request; message is the backend's { error } text.
export class ApiError extends Error {
    constructor(message, status, details = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.details = details;
    }
}

// Single entry point for every backend call.
export async function request(path, { method = 'GET', params, body, signal } = {}) {
    const url = new URL(`${BASE_URL}${path}`, window.location.origin);

    for (const [key, value] of Object.entries(params ?? {})) {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, value);
        }
    }

    let response;

    try {
        response = await fetch(url, {
            method,
            signal,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined
        });
    } catch (error) {
        if (error.name === 'AbortError') {
            throw error;
        }

        throw new ApiError('Cannot reach the server. Is the API running?', 0);
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        throw new ApiError(
            data?.error ?? `Request failed with status ${response.status}`,
            response.status,
            data
        );
    }

    return data;
}
