const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { encrypt, decrypt } = require('../../utils/encryption');
const { hashIdentifier, last4 } = require('../../utils/hashIdentifier');

const ENV_NAMES = ['ID_ENCRYPTION_KEY', 'ID_ENCRYPTION_KEY_ID', 'ID_HASH_KEY'];
let savedEnv;

before(() => {
    savedEnv = Object.fromEntries(ENV_NAMES.map(name => [name, process.env[name]]));
    process.env.ID_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    process.env.ID_ENCRYPTION_KEY_ID = 'k1';
    process.env.ID_HASH_KEY = crypto.randomBytes(32).toString('base64');
});

after(() => {
    for (const name of ENV_NAMES) {
        if (savedEnv[name] === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = savedEnv[name];
        }
    }
});

// Swap one env value for the length of a check.
function withEnv(name, value, check) {
    const saved = process.env[name];
    process.env[name] = value;

    try {
        check();
    } finally {
        process.env[name] = saved;
    }
}

describe('encryption', () => {
    it('decrypts what it encrypted, naming the key', () => {
        const stored = encrypt('234123412346');

        assert.match(stored, /^gcm:k1:/);
        assert.equal(decrypt(stored), '234123412346');
    });

    it('gives a different value each time for the same text', () => {
        assert.notEqual(encrypt('ABCPE1234F'), encrypt('ABCPE1234F'));
    });

    it('fails when the stored value or its tag was changed', () => {
        const [scheme, keyId, iv, tag, ciphertext] = encrypt('123456789012').split(':');
        const flip = value => {
            const bytes = Buffer.from(value, 'base64');
            bytes[0] ^= 1;
            return bytes.toString('base64');
        };

        assert.throws(() => decrypt([scheme, keyId, iv, tag, flip(ciphertext)].join(':')));
        assert.throws(() => decrypt([scheme, keyId, iv, flip(tag), ciphertext].join(':')));
    });

    it('fails with an unknown key id or a value that is not encrypted', () => {
        const stored = encrypt('123456789012');

        withEnv('ID_ENCRYPTION_KEY_ID', 'k2', () => {
            assert.throws(() => decrypt(stored), /Unknown encryption key "k1"/);
        });
        assert.throws(() => decrypt('123456789012'), /Not an encrypted value/);
    });

    it('refuses a missing or short key and empty text', () => {
        withEnv('ID_ENCRYPTION_KEY', '', () => {
            assert.throws(() => encrypt('x'), /must be 32 bytes/);
        });
        withEnv('ID_ENCRYPTION_KEY', crypto.randomBytes(16).toString('base64'), () => {
            assert.throws(() => encrypt('x'), /must be 32 bytes/);
        });
        withEnv('ID_ENCRYPTION_KEY_ID', 'bad:id', () => {
            assert.throws(() => encrypt('x'), /may only use/);
        });
        assert.throws(() => encrypt(''), /non-empty/);
    });
});

describe('hashIdentifier', () => {
    it('gives the same hash for the same number however it is typed', () => {
        const hash = hashIdentifier('pan', 'ABCPE1234F');

        assert.match(hash, /^[0-9a-f]{64}$/);
        assert.equal(hashIdentifier('pan', ' abcpe 1234-f '), hash);
    });

    it('gives a different hash for another type or another key', () => {
        const hash = hashIdentifier('aadhaar', '234123412346');

        assert.notEqual(hashIdentifier('bank', '234123412346'), hash);
        withEnv('ID_HASH_KEY', crypto.randomBytes(32).toString('base64'), () => {
            assert.notEqual(hashIdentifier('aadhaar', '234123412346'), hash);
        });
    });

    it('refuses a missing or short key', () => {
        withEnv('ID_HASH_KEY', crypto.randomBytes(16).toString('base64'), () => {
            assert.throws(() => hashIdentifier('pan', 'ABCPE1234F'), /at least 32 bytes/);
        });
    });

    it('keeps the last 4 characters after removing spaces and dashes', () => {
        assert.equal(last4('2341 2341 2346'), '2346');
        assert.equal(last4('mh12-2019-0012345'), '2345');
    });
});
