const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

describe('Security headers', () => {
    it('are set on API responses and X-Powered-By is removed', async () => {
        const response = await h.api('GET', '/health');

        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
        assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
        assert.match(response.headers.get('strict-transport-security'), /max-age=/);
        assert.equal(response.headers.get('x-powered-by'), null);
    });

    it('do not let other origins read responses (no CORS headers)', async () => {
        const response = await h.api('GET', '/api/riders', undefined, { Origin: 'https://evil.example' });

        assert.equal(response.status, 200);
        assert.equal(response.headers.get('access-control-allow-origin'), null);
    });
});

describe('Cross-site requests', () => {
    it('refuses changes that a browser marks as coming from another site', async () => {
        for (const site of ['cross-site', 'same-site']) {
            const response = await h.api('POST', '/api/auth/logout', undefined, { 'Sec-Fetch-Site': site });

            assert.equal(response.status, 403);
            assert.equal(response.body.error, 'Cross-site requests are not allowed');
        }

        // The refused requests did not end the session.
        assert.equal((await h.api('GET', '/api/auth/me')).status, 200);
    });

    it('allows same-origin changes, cross-site reads and tools without the header', async () => {
        const sameOrigin = await h.api('POST', '/api/auth/logout', undefined, { 'Sec-Fetch-Site': 'same-origin' });
        assert.equal(sameOrigin.status, 200);

        const crossSiteRead = await h.api('GET', '/health', undefined, { 'Sec-Fetch-Site': 'cross-site' });
        assert.equal(crossSiteRead.status, 200);

        const noHeader = await h.api('POST', '/api/auth/logout');
        assert.equal(noHeader.status, 200);
    });
});

describe('Bad requests', () => {
    it('answers malformed JSON with 400', async () => {
        const response = await fetch(h.url('/api/auth/login'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"email": '
        });

        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { error: 'Request body is not valid JSON' });
    });

    it('answers a body over 100 kB with 413', async () => {
        const response = await h.api('POST', '/api/auth/login', {
            email: 'a@test.local',
            password: 'x'.repeat(110 * 1024)
        });

        assert.equal(response.status, 413);
        assert.equal(response.body.error, 'Request body is too large');
    });

    it('answers unknown API routes with a JSON 404', async () => {
        const response = await h.api('GET', '/api/does-not-exist');

        assert.equal(response.status, 404);
        assert.equal(response.body.error, 'Route not found');
    });

    it('asks for sign-in before revealing whether a route exists', async () => {
        const response = await h.api('GET', '/api/does-not-exist', undefined, { Cookie: '' });

        assert.equal(response.status, 401);
    });
});
