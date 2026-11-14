const crypto = require('crypto');

// Mock of the payment provider that creates a payment link for the rider's app.
// The real client asks the provider for a link and returns its ID as the token.
// The mock link opens the mock pay page in the admin UI (APP_URL), where the rider swipes to pay.

function linkUrl(token) {
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    return `${appUrl}/mock-pay/${token}`;
}

async function createLink() {
    const token = crypto.randomBytes(32).toString('hex');
    return { token, url: linkUrl(token) };
}

module.exports = {
    createLink,
    linkUrl
};
