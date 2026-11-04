const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

// Stored as "scrypt:<salt hex>:<hash hex>" so the format can change later.
async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = await scrypt(password, salt, KEY_LENGTH);

    return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
    const [scheme, saltHex, hashHex] = String(storedHash).split(':');
    const expected = Buffer.from(hashHex ?? '', 'hex');

    if (scheme !== 'scrypt' || !saltHex || expected.length !== KEY_LENGTH) {
        return false;
    }

    const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH);

    // Constant-time comparison, so response time does not reveal how much matched.
    return crypto.timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword };
