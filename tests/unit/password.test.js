const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../../utils/password');

describe('password hashing', () => {
    it('verifies the right password and rejects a wrong one', async () => {
        const hash = await hashPassword('correct horse');

        assert.equal(await verifyPassword('correct horse', hash), true);
        assert.equal(await verifyPassword('wrong horse', hash), false);
    });

    it('salts every hash', async () => {
        assert.notEqual(await hashPassword('same'), await hashPassword('same'));
    });

    it('treats a malformed stored hash as a mismatch', async () => {
        for (const stored of ['', 'plain-text', 'scrypt:abcd:1234', null]) {
            assert.equal(await verifyPassword('anything', stored), false);
        }
    });
});
