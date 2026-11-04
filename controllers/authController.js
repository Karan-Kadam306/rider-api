const authService = require('../services/authService');
const { readSessionToken, setSessionCookie, clearSessionCookie } = require('../utils/sessionCookie');

// POST /api/auth/login
// Body: { email, password }. Sets the session cookie.
async function login(req, res, next) {
    try {
        const { email, password } = req.body ?? {};
        const { user, token, expiresAt } = await authService.login({ email, password });

        setSessionCookie(res, token, expiresAt);
        return res.status(200).json({ user });
    } catch (error) {
        return next(error);
    }
}

// POST /api/auth/logout
// Ends the current session. Safe to call when already signed out.
async function logout(req, res, next) {
    try {
        await authService.logout(readSessionToken(req));

        clearSessionCookie(res);
        return res.status(200).json({ message: 'Signed out' });
    } catch (error) {
        return next(error);
    }
}

// GET /api/auth/me
// The signed-in user (set by requireAuth).
function getCurrentUser(req, res) {
    return res.status(200).json({ user: req.user });
}

module.exports = {
    login,
    logout,
    getCurrentUser
};
