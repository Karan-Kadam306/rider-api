const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

let keyCounter = 0;

function assign(bikeId, riderId, key = `key-${++keyCounter}`) {
    return h.api(
        'POST',
        '/api/bike-assignments',
        { bikeId, riderId, clientId: 'admin-panel' },
        { 'Idempotency-Key': key }
    );
}

describe('Bike management', () => {
    it('creates a bike and normalises the registration number', async () => {
        const res = await h.api('POST', '/api/bikes', {
            chassisNumber: 'VIN-1', registrationNumber: 'mh 12 ab 1234'
        });

        assert.equal(res.status, 201);
        assert.equal(res.body.bike.registrationNumber, 'MH12AB1234');
        assert.equal(res.body.bike.status, 'Available');
    });

    it('rejects a duplicate chassis number with 409', async () => {
        await h.createBike('VIN-1');

        const res = await h.api('POST', '/api/bikes', { chassisNumber: 'VIN-1' });

        assert.equal(res.status, 409);
        assert.equal(res.body.error, 'Chassis number already registered');
    });

    it('requires a chassis number', async () => {
        const res = await h.api('POST', '/api/bikes', {});

        assert.equal(res.status, 400);
    });

    it('lists bikes with search, pagination and the current rider', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-AAA');
        await h.createBike('VIN-BBB');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');

        const res = await h.api('GET', '/api/bikes?search=aaa&limit=1');

        assert.equal(res.status, 200);
        assert.equal(res.body.pagination.totalRecords, 1);
        assert.equal(res.body.bikes[0].currentRider.riderId, 'YS-001');
    });

    it('returns 404 for an unknown bike', async () => {
        const res = await h.api('GET', '/api/bikes/999');

        assert.equal(res.status, 404);
    });

    it('moves a bike to Maintenance and back', async () => {
        const bikeId = await h.createBike('VIN-1');

        const toMaintenance = await h.api('PATCH', `/api/bikes/${bikeId}/status`, { status: 'Maintenance' });
        const toAvailable = await h.api('PATCH', `/api/bikes/${bikeId}/status`, { status: 'Available' });

        assert.equal(toMaintenance.body.bike.status, 'Maintenance');
        assert.equal(toAvailable.body.bike.status, 'Available');
    });

    it('does not allow setting Assigned by hand', async () => {
        const bikeId = await h.createBike('VIN-1');

        const res = await h.api('PATCH', `/api/bikes/${bikeId}/status`, { status: 'Assigned' });

        assert.equal(res.status, 400);
    });

    it('an assigned bike cannot go to Maintenance', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');

        const res = await h.api('PATCH', `/api/bikes/${bikeId}/status`, { status: 'Maintenance' });

        assert.equal(res.status, 409);
    });
});

describe('Bike assignment', () => {
    it('assigns an Available bike to an Active rider', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');

        const res = await assign(bikeId, 'YS-001');

        assert.equal(res.status, 201);
        const bike = await h.api('GET', `/api/bikes/${bikeId}`);
        assert.equal(bike.body.bike.status, 'Assigned');
    });

    it('allows an Inactive rider', async () => {
        await h.createRider('YS-001', { status: 'Inactive' });
        const bikeId = await h.createBike('VIN-1');

        assert.equal((await assign(bikeId, 'YS-001')).status, 201);
    });

    it('blocks a Terminated rider', async () => {
        await h.createRider('YS-001', { status: 'Terminated', terminatedOn: '2026-10-14' });
        const bikeId = await h.createBike('VIN-1');

        assert.equal((await assign(bikeId, 'YS-001')).status, 409);
    });

    it('blocks a second bike for the same rider', async () => {
        await h.createRider('YS-001');
        const bike1 = await h.createBike('VIN-1');
        const bike2 = await h.createBike('VIN-2');
        await assign(bike1, 'YS-001');

        const res = await assign(bike2, 'YS-001');

        assert.equal(res.status, 409);
        assert.match(res.body.error, /already has an active bike/);
    });

    it('blocks a bike in Maintenance', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1', { status: 'Maintenance' });

        assert.equal((await assign(bikeId, 'YS-001')).status, 409);
    });

    it('returns 404 (not 500) for an unknown bike', async () => {
        await h.createRider('YS-001');

        assert.equal((await assign(999, 'YS-001')).status, 404);
    });

    it('two requests at the same moment: one 201, one 409', async () => {
        await h.createRider('YS-001');
        const bike1 = await h.createBike('VIN-1');
        const bike2 = await h.createBike('VIN-2');

        // Hold the rider row lock so both requests are waiting at the same point,
        // then release it. Without FOR UPDATE in the service, both would succeed.
        const blocker = await h.pool.connect();
        await blocker.query('BEGIN');
        await blocker.query(`SELECT 1 FROM riders WHERE rider_id = 'YS-001' FOR UPDATE`);

        const requests = Promise.all([assign(bike1, 'YS-001'), assign(bike2, 'YS-001')]);
        await new Promise(resolve => setTimeout(resolve, 300));

        await blocker.query('COMMIT');
        blocker.release();

        const results = await requests;

        assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);

        const open = await h.pool.query(
            `SELECT COUNT(*)::int AS n FROM bike_assignments WHERE rider_id = 'YS-001' AND returned_at IS NULL`
        );
        assert.equal(open.rows[0].n, 1);
    });

    it('replays the same idempotency key without a second assignment', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');

        const first = await assign(bikeId, 'YS-001', 'same-key');
        const second = await assign(bikeId, 'YS-001', 'same-key');

        assert.equal(second.status, 201);
        assert.equal(second.headers.get('idempotency-replayed'), 'true');
        assert.deepEqual(second.body, first.body);

        const count = await h.pool.query(`SELECT COUNT(*)::int AS n FROM bike_assignments`);
        assert.equal(count.rows[0].n, 1);
    });

    it('rejects the same idempotency key with different data (422)', async () => {
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        const bikeId = await h.createBike('VIN-1');
        await assign(bikeId, 'YS-001', 'same-key');

        assert.equal((await assign(bikeId, 'YS-002', 'same-key')).status, 422);
    });
});

describe('Bike return and history', () => {
    it('returns a bike, makes it Available, and keeps the history', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        await assign(bikeId, 'YS-001');

        const res = await h.api('POST', `/api/bikes/${bikeId}/return`);
        assert.equal(res.status, 200);

        const bike = await h.api('GET', `/api/bikes/${bikeId}`);
        assert.equal(bike.body.bike.status, 'Available');

        const history = await h.api('GET', `/api/bikes/${bikeId}/assignments`);
        assert.equal(history.body.history.length, 1);
        assert.notEqual(history.body.history[0].returnedAt, null);
    });

    it('returning a bike that is not assigned gives 409', async () => {
        const bikeId = await h.createBike('VIN-1');

        assert.equal((await h.api('POST', `/api/bikes/${bikeId}/return`)).status, 409);
    });
});
