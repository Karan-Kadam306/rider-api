const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

describe('Riders', () => {
    it('creates a rider as Active', async () => {
        const res = await h.api('POST', '/api/riders', {
            rider_id: 'YS-001', name: 'Karan Kadam', phone: '9876543210'
        });

        assert.equal(res.status, 201);
        assert.equal(res.body.rider.status, 'Active');
    });

    it('rejects a duplicate phone with 409', async () => {
        const rider = { rider_id: 'YS-001', name: 'Karan Kadam', phone: '9876543210' };
        await h.api('POST', '/api/riders', rider);

        const res = await h.api('POST', '/api/riders', { ...rider, rider_id: 'YS-002' });

        assert.equal(res.status, 409);
        assert.equal(res.body.error, 'Phone number already registered');
    });

    it('returns 404 for an unknown rider', async () => {
        const res = await h.api('GET', '/api/riders/NOPE');

        assert.equal(res.status, 404);
    });

    it('lists riders filtered by status', async () => {
        await h.createRider('YS-001');
        await h.createRider('YS-002', { status: 'Inactive' });

        const res = await h.api('GET', '/api/riders?status=Inactive');

        assert.equal(res.status, 200);
        assert.deepEqual(res.body.riders.map(r => r.rider_id), ['YS-002']);
    });

    it('PUT cannot set Terminated', async () => {
        await h.createRider('YS-001');

        const res = await h.api('PUT', '/api/riders/YS-001', {
            name: 'Karan Kadam', phone: '9876543210', status: 'Terminated'
        });

        assert.equal(res.status, 400);
    });

    it('PUT cannot update a terminated rider', async () => {
        await h.createRider('YS-001', { status: 'Terminated', terminatedOn: '2026-10-14' });

        const res = await h.api('PUT', '/api/riders/YS-001', {
            name: 'Karan Kadam', phone: '9876543210', status: 'Active'
        });

        assert.equal(res.status, 409);
    });
});

describe('Rider details, updates and lists', () => {
    it('returns one rider', async () => {
        await h.createRider('YS-001');

        const res = await h.api('GET', '/api/riders/YS-001');

        assert.equal(res.status, 200);
        assert.equal(res.body.rider.name, 'Rider YS-001');
    });

    it('updates name, phone and status', async () => {
        await h.createRider('YS-001');

        const res = await h.api('PUT', '/api/riders/YS-001', {
            name: '  Karan Kadam ', phone: '9876543210', status: 'Inactive'
        });

        assert.equal(res.status, 200);
        assert.equal(res.body.rider.name, 'Karan Kadam');
        assert.equal(res.body.rider.status, 'Inactive');
    });

    it('returns 404 when updating or terminating an unknown rider', async () => {
        const update = await h.api('PUT', '/api/riders/NOPE', {
            name: 'Karan Kadam', phone: '9876543210', status: 'Active'
        });

        assert.equal(update.status, 404);
        assert.equal((await h.api('DELETE', '/api/riders/NOPE')).status, 404);
    });

    it('rejects a duplicate rider ID with 409', async () => {
        await h.createRider('YS-001');

        const res = await h.api('POST', '/api/riders', {
            rider_id: 'YS-001', name: 'Karan Kadam', phone: '9876543299'
        });

        assert.equal(res.status, 409);
        assert.equal(res.body.error, 'Rider ID Already Exists');
    });

    it('searches by name, ID or phone, sorts and pages', async () => {
        for (const id of ['YS-001', 'YS-002', 'YS-003']) {
            await h.createRider(id);
        }

        const search = await h.api('GET', '/api/riders?search=ys-002');
        assert.deepEqual(search.body.riders.map(r => r.rider_id), ['YS-002']);

        const sorted = await h.api('GET', '/api/riders?sortBy=name&order=asc&limit=2&page=2');
        assert.deepEqual(sorted.body.riders.map(r => r.rider_id), ['YS-003']);
        assert.deepEqual(sorted.body.pagination, { page: 2, limit: 2, offset: 2, totalRecords: 3, totalPages: 2 });
    });

    it('counts riders by status', async () => {
        await h.createRider('YS-001');
        await h.createRider('YS-002', { status: 'Inactive' });

        const res = await h.api('GET', '/api/riders/summary');

        assert.equal(res.status, 200);
        assert.equal(res.body.summary.Active, 1);
        assert.equal(res.body.summary.Inactive, 1);
    });
});

describe('Rider termination', () => {
    it('sets status Terminated and terminated_on to today (IST)', async () => {
        await h.createRider('YS-001');

        const res = await h.api('DELETE', '/api/riders/YS-001');

        assert.equal(res.status, 200);
        assert.equal(res.body.rider.status, 'Terminated');
        assert.equal(res.body.rider.terminated_on, h.todayInIst());
        assert.equal(res.body.returnedAssignment, null);
    });

    it('returns the rider\'s bike and makes it Available', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');

        const res = await h.api('DELETE', '/api/riders/YS-001');

        assert.equal(res.status, 200);
        assert.equal(Number(res.body.returnedAssignment.bike_id), bikeId);

        const bike = await h.api('GET', `/api/bikes/${bikeId}`);
        assert.equal(bike.body.bike.status, 'Available');
        assert.equal(bike.body.bike.currentRider, null);
    });

    it('rolls back: if the bike return fails, the rider stays Active', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');

        // Corrupt data: open assignment but the bike says Available.
        await h.pool.query(`UPDATE bikes SET status = 'Available' WHERE bike_id = $1`, [bikeId]);

        const res = await h.api('DELETE', '/api/riders/YS-001');
        assert.equal(res.status, 409);

        const rider = await h.api('GET', '/api/riders/YS-001');
        assert.equal(rider.body.rider.status, 'Active');
    });

    it('rejects terminating twice with 409', async () => {
        await h.createRider('YS-001');
        await h.api('DELETE', '/api/riders/YS-001');

        const res = await h.api('DELETE', '/api/riders/YS-001');

        assert.equal(res.status, 409);
    });
});
