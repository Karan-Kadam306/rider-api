const crypto = require('crypto');

// The payment provider signs each webhook body with a shared secret (HMAC-SHA256, hex),
// sent in the X-Payment-Signature header. The mock swipe signs its webhook the same way.

function getSecret() {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;

    if (!secret) {
        throw new Error('PAYMENT_WEBHOOK_SECRET is not set');
    }

    return secret;
}

// rawBody is the exact request body, as a string or Buffer.
function sign(rawBody) {
    return crypto.createHmac('sha256', getSecret()).update(rawBody).digest('hex');
}

// True only when the signature matches the body. A missing secret fails closed.
function verify(rawBody, signature) {
    if (!process.env.PAYMENT_WEBHOOK_SECRET || typeof signature !== 'string') {
        return false;
    }

    const expected = Buffer.from(sign(rawBody), 'hex');
    const received = Buffer.from(signature, 'hex');

    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

module.exports = {
    sign,
    verify
};
