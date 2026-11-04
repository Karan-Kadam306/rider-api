const authService = require('../services/authService');
const { readSessionToken, setSessionCookie, clearSessionCookie } = require('../utils/sessionCookie');

// POST /api/auth/login
// Body: { email, password }. Sets the session cookie.
async function login(req, res, next) {
    try {
        const { email, password } = req.body ?? {};
        const { user, token, expiresAt } = await authService.login({ email, password, ipAddress: req.ip });

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

// POST /api/auth/password
// Body: { currentPassword, newPassword }. Other browsers signed in as this user are signed out.
async function changePassword(req, res, next) {
    try {
        const { currentPassword, newPassword } = req.body ?? {};

        await authService.changePassword({
            userId: req.user.userId,
            token: readSessionToken(req),
            currentPassword,
            newPassword,
            ipAddress: req.ip
        });

        return res.status(200).json({ message: 'Password changed' });
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
    changePassword,
    getCurrentUser
};
