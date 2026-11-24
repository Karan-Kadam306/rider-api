const crypto = require('crypto');

// Encrypts Aadhaar, PAN, DL and bank account numbers before they are stored.
// AES-256-GCM with a random IV; the auth tag makes any change to the stored value fail to decrypt.
// Stored as "gcm:<key id>:<iv>:<tag>:<ciphertext>" (base64) so the key can be rotated later:
// old values name the key they were encrypted with.

const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,20}$/;

function getKey() {
    const key = Buffer.from(process.env.ID_ENCRYPTION_KEY ?? '', 'base64');
    const keyId = process.env.ID_ENCRYPTION_KEY_ID || 'k1';

    if (key.length !== 32) {
        throw new Error('ID_ENCRYPTION_KEY must be 32 bytes, base64 encoded');
    }

    if (!KEY_ID_PATTERN.test(keyId)) {
        throw new Error('ID_ENCRYPTION_KEY_ID may only use letters, digits, _ and -');
    }

    return { key, keyId };
}

function encrypt(text) {
    if (typeof text !== 'string' || text === '') {
        throw new Error('Only non-empty text can be encrypted');
    }

    const { key, keyId } = getKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);

    return ['gcm', keyId, iv, cipher.getAuthTag(), ciphertext]
        .map(part => (Buffer.isBuffer(part) ? part.toString('base64') : part))
        .join(':');
}

function decrypt(stored) {
    const [scheme, keyId, iv, tag, ciphertext] = String(stored).split(':');

    if (scheme !== 'gcm' || !iv || !tag || !ciphertext) {
        throw new Error('Not an encrypted value');
    }

    const current = getKey();

    if (keyId !== current.keyId) {
        throw new Error(`Unknown encryption key "${keyId}"`);
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', current.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));

    // final() throws if the value or tag was changed.
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
