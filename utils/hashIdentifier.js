const crypto = require('crypto');

// A keyed hash of an ID or account number, so duplicates can be found without decrypting.
// The type is part of the hash, so an Aadhaar number never matches a bank account number,
// and the number is normalised first, so "abcde 1234 f" and "ABCDE1234F" match.

function normalise(value) {
    return String(value).toUpperCase().replace(/[\s-]/g, '');
}

function getKey() {
    const key = Buffer.from(process.env.ID_HASH_KEY ?? '', 'base64');

    if (key.length < 32) {
        throw new Error('ID_HASH_KEY must be at least 32 bytes, base64 encoded');
    }

    return key;
}

// 64 hex characters.
function hashIdentifier(type, value) {
    return crypto.createHmac('sha256', getKey()).update(`${type}:${normalise(value)}`).digest('hex');
}

// The last 4 characters, the only part of a number the admin panel shows.
function last4(value) {
    return normalise(value).slice(-4);
}

module.exports = { hashIdentifier, last4, normalise };
