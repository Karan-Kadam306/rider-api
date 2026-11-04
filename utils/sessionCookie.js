const SESSION_COOKIE = 'rider_session';

// httpOnly: page scripts cannot read it. SameSite=Strict: other sites cannot send it (CSRF).
function cookieOptions() {
    return {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        path: '/'
    };
}

// The raw session token from the request's Cookie header, or null.
function readSessionToken(req) {
    for (const part of (req.headers.cookie ?? '').split(';')) {
        const [name, ...value] = part.trim().split('=');

        if (name === SESSION_COOKIE) {
            return value.join('=') || null;
        }
    }

    return null;
}

function setSessionCookie(res, token, expiresAt) {
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), expires: expiresAt });
}

function clearSessionCookie(res) {
    res.clearCookie(SESSION_COOKIE, cookieOptions());
}

module.exports = {
    SESSION_COOKIE,
    readSessionToken,
    setSessionCookie,
    clearSessionCookie
};
