const riderAuthService = require('../services/riderAuthService');
const { readBearerToken } = require('../middleware/requireRider');

// POST /api/rider-app/auth/otp/request
// Body: { phone }. Sends a 6-digit code by SMS.
async function requestOtp(req, res, next) {
    try {
        const result = await riderAuthService.requestOtp({ phone: req.body?.phone, ipAddress: req.ip });
        return res.status(200).json(result);
    } catch (error) {
        return next(error);
    }
}

// POST /api/rider-app/auth/otp/verify
// Body: { phone, code, signup?: { firstName, surname, dateOfBirth }, deviceInfo? }.
// Returns { token, expiresAt, account }; the app sends the token as a bearer token.
async function verifyOtp(req, res, next) {
    try {
        const { phone, code, signup, deviceInfo } = req.body ?? {};
        const result = await riderAuthService.verifyOtp({ phone, code, signup, deviceInfo, ipAddress: req.ip });

        return res.status(200).json(result);
    } catch (error) {
        return next(error);
    }
}

// POST /api/rider-app/auth/logout
// Ends this app session. Safe to call when already signed out.
async function logout(req, res, next) {
    try {
        await riderAuthService.logout(readBearerToken(req));
        return res.status(200).json({ message: 'Signed out' });
    } catch (error) {
        return next(error);
    }
}

// GET /api/rider-app/auth/me
// The signed-in rider or applicant (set by requireRider).
function getAccount(req, res) {
    return res.status(200).json({ account: req.rider.account });
}

module.exports = {
    requestOtp,
    verifyOtp,
    logout,
    getAccount
};
