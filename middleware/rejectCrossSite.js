const AppError = require('../errors/AppError');

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

// Browsers label every request with Sec-Fetch-Site. A change (POST, PATCH, ...) that another
// site started is refused, on top of the SameSite=Strict cookie. Tools such as curl or Postman
// do not send the header and are not affected.
function rejectCrossSite(req, res, next) {
    const site = req.get('Sec-Fetch-Site');

    if (!SAFE_METHODS.includes(req.method) && site && site !== 'same-origin' && site !== 'none') {
        return next(new AppError('Cross-site requests are not allowed', 403));
    }

    return next();
}

module.exports = { rejectCrossSite };
