const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

const NEW_HUB = {
    code: ' pun-wkd ',
    name: ' Wakad  Hub ',
    city: 'Pune',
    address: 'Plot 12, Wakad',
    contactPhone: '9876543210',
    managerName: ' Suresh  Pawar '
};

describe('Hubs', () => {
    it('creates a hub with tidied text', async () => {
        const res = await h.api('POST', '/api/hubs', NEW_HUB);

        assert.equal(res.status, 201);
        assert.equal(res.body.hub.code, 'PUN-WKD');
        assert.equal(res.body.hub.name, 'Wakad Hub');
        assert.equal(res.body.hub.contactPhone, '9876543210');
        assert.equal(res.body.hub.managerName, 'Suresh Pawar');
        assert.equal(res.body.hub.isActive, true);
    });

    it('rejects missing fields, a bad phone and a duplicate name', async () => {
        const missing = await h.api('POST', '/api/hubs', { ...NEW_HUB, address: '  ' });
        const badPhone = await h.api('POST', '/api/hubs', { ...NEW_HUB, contactPhone: '12345' });
        const duplicate = await h.api('POST', '/api/hubs', { ...NEW_HUB, name: 'test hub' });

        assert.equal(missing.status, 400);
        assert.equal(badPhone.status, 400);
        assert.equal(duplicate.status, 409);
        assert.equal(duplicate.body.error, 'A hub with this name already exists');
    });

    it('needs a short unique code and keeps the manager name short', async () => {
        const noCode = await h.api('POST', '/api/hubs', { ...NEW_HUB, code: undefined });
        const badCode = await h.api('POST', '/api/hubs', { ...NEW_HUB, code: 'PUNE WAKAD' });
        const longCode = await h.api('POST', '/api/hubs', { ...NEW_HUB, code: 'PUNE-WAKAD-1' });
        const longManager = await h.api('POST', '/api/hubs', { ...NEW_HUB, managerName: 'x'.repeat(101) });
        await h.api('POST', '/api/hubs', NEW_HUB);
        const duplicate = await h.api('POST', '/api/hubs', { ...NEW_HUB, name: 'Another Hub', code: 'Pun-Wkd' });

        assert.equal(noCode.status, 400);
        assert.equal(badCode.status, 400);
        assert.equal(longCode.status, 400);
        assert.equal(longManager.status, 400);
        assert.equal(duplicate.status, 409);
        assert.equal(duplicate.body.error, 'A hub with this code already exists');
    });

    it('lists hubs with bike counts, active hubs first', async () => {
        await h.createHub('Closed Hub', { isActive: false });
        await h.createBike('VIN-1');
        await h.createBike('VIN-2', { status: 'Maintenance' });

        const res = await h.api('GET', '/api/hubs');

        assert.equal(res.status, 200);
        assert.deepEqual(
            res.body.hubs.map(hub => [hub.name, hub.totalBikes, hub.availableBikes]),
            [['Test Hub', 2, 1], ['Closed Hub', 0, 0]]
        );
    });

    it('updates only the fields sent and can clear the phone and manager', async () => {
        const created = await h.api('POST', '/api/hubs', NEW_HUB);
        const hubId = created.body.hub.hubId;

        const res = await h.api('PATCH', `/api/hubs/${hubId}`, { address: 'Plot 14, Wakad', contactPhone: '', managerName: '' });

        assert.equal(res.status, 200);
        assert.equal(res.body.hub.code, 'PUN-WKD');
        assert.equal(res.body.hub.name, 'Wakad Hub');
        assert.equal(res.body.hub.address, 'Plot 14, Wakad');
        assert.equal(res.body.hub.contactPhone, null);
        assert.equal(res.body.hub.managerName, null);

        const renamed = await h.api('PATCH', `/api/hubs/${hubId}`, { code: 'pun-01' });
        assert.equal(renamed.body.hub.code, 'PUN-01');
        assert.equal(renamed.body.hub.name, 'Wakad Hub');
    });

    it('deactivates a hub only once it has no bikes', async () => {
        const hubId = h.getDefaultHubId();
        const bikeId = await h.createBike('VIN-1');
        const otherHubId = await h.createHub('Other Hub');

        const blocked = await h.api('PATCH', `/api/hubs/${hubId}`, { isActive: false });
        await h.api('PATCH', `/api/bikes/${bikeId}/hub`, { hubId: otherHubId });
        const allowed = await h.api('PATCH', `/api/hubs/${hubId}`, { isActive: false });

        assert.equal(blocked.status, 409);
        assert.equal(allowed.status, 200);
        assert.equal(allowed.body.hub.isActive, false);
    });

    it('returns 404 for an unknown hub', async () => {
        const res = await h.api('PATCH', '/api/hubs/999', { name: 'Nowhere' });

        assert.equal(res.status, 404);
    });

    it('lets staff list hubs but not change them', async () => {
        const asStaff = { Cookie: await h.signIn(await h.createUser({ email: 'staff@test.local' })) };

        const list = await h.api('GET', '/api/hubs', undefined, asStaff);
        const create = await h.api('POST', '/api/hubs', NEW_HUB, asStaff);
        const update = await h.api('PATCH', `/api/hubs/${h.getDefaultHubId()}`, { name: 'Renamed' }, asStaff);

        assert.equal(list.status, 200);
        assert.equal(create.status, 403);
        assert.equal(update.status, 403);
    });
});
