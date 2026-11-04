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

// Called when the session has ended (any 401 outside /api/auth), so the app can show the login page.
let handleUnauthorized = () => {};

export function setUnauthorizedHandler(handler) {
    handleUnauthorized = handler;
}

function checkSession(path, response) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
        handleUnauthorized();
    }
}

function buildUrl(path, params) {
    const url = new URL(`${BASE_URL}${path}`, window.location.origin);

    for (const [key, value] of Object.entries(params ?? {})) {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, value);
        }
    }

    return url;
}

// Single entry point for every backend call.
export async function request(path, { method = 'GET', params, body, headers, signal } = {}) {
    const url = buildUrl(path, params);

    // File uploads send FormData as-is; the browser sets the multipart Content-Type.
    const isForm = body instanceof FormData;
    let response;

    try {
        response = await fetch(url, {
            method,
            signal,
            headers: {
                ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
                ...headers
            },
            body: body && !isForm ? JSON.stringify(body) : body
        });
    } catch (error) {
        if (error.name === 'AbortError') {
            throw error;
        }

        throw new ApiError('Cannot reach the server. Is the API running?', 0);
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        checkSession(path, response);

        throw new ApiError(
            data?.error ?? `Request failed with status ${response.status}`,
            response.status,
            data
        );
    }

    return data;
}

// Download a file (e.g. a CSV export) and save it under the server's file name.
export async function download(path, { params, fallbackName = 'download' } = {}) {
    let response;

    try {
        response = await fetch(buildUrl(path, params));
    } catch {
        throw new ApiError('Cannot reach the server. Is the API running?', 0);
    }

    if (!response.ok) {
        checkSession(path, response);

        const data = await response.json().catch(() => null);
        throw new ApiError(data?.error ?? `Download failed with status ${response.status}`, response.status, data);
    }

    const disposition = response.headers.get('Content-Disposition') ?? '';
    const fileName = disposition.match(/filename="?([^";]+)"?/)?.[1] ?? fallbackName;
    const objectUrl = URL.createObjectURL(await response.blob());

    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(objectUrl);

    return fileName;
}
