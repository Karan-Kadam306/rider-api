const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

const WEEK = '2026-10-12'; // Monday

function dashboard(weekStart = WEEK) {
    return h.api('GET', `/api/dashboard?weekStart=${weekStart}`);
}

// Three riders with bikes, one with bad data, one terminated with no bike.
async function seedWeek() {
    await h.createRider('YS-001');
    await h.createRider('YS-002', { status: 'Inactive' });
    await h.createRider('YS-BAD', { status: 'Terminated' });
    await h.createRider('YS-OLD', { status: 'Terminated', terminatedOn: '2026-09-30' });

    const bike1 = await h.createBike('VIN-1');
    const bike2 = await h.createBike('VIN-2');
    const bike3 = await h.createBike('VIN-3');
    await h.createBike('VIN-4', { status: 'Maintenance' });

    await h.createAssignment(bike1, 'YS-001', '2026-10-01 09:00');
    await h.createAssignment(bike2, 'YS-002', '2026-10-15 09:00');
    await h.createAssignment(bike3, 'YS-BAD', '2026-10-01 09:00');

    await h.createKmRecord({ vin: 'VIN-1', bikeId: bike1, riderId: 'YS-001', usageDate: '2026-10-13', dailyKm: 20, status: 'Validated' });
    await h.createKmRecord({ vin: 'VIN-1', bikeId: bike1, riderId: 'YS-001', usageDate: '2026-10-14', dailyKm: 10, status: 'Pending' });
    await h.createKmRecord({ vin: 'VIN-X', usageDate: '2026-10-14', dailyKm: 5, status: 'Needs Review' });
    // Outside the week: not counted.
    await h.createKmRecord({ vin: 'VIN-1', bikeId: bike1, riderId: 'YS-001', usageDate: '2026-10-19', dailyKm: 50, status: 'Pending' });
}

describe('Dashboard', () => {
    it('returns the cards and widgets for the week in one call', async () => {
        await seedWeek();

        const res = await dashboard();

        assert.equal(res.status, 200);

        const { dashboard: d } = res.body;

        assert.equal(d.weekStart, WEEK);
        assert.equal(d.weekEnd, '2026-10-18');
        assert.deepEqual(d.riders, { Active: 1, Inactive: 1, Terminated: 2, total: 4 });
        assert.deepEqual(d.bikes, { Available: 0, Assigned: 3, Maintenance: 1, total: 4 });
        assert.deepEqual(d.dailyKm, { Pending: 1, Validated: 1, 'Needs Review': 1, total: 3 });

        // YS-001: 7 × ₹59 + 20 km × ₹1.50 = ₹443. YS-002: Thu–Sun 4 × ₹59 = ₹236.
        assert.equal(d.billing.closed, false);
        assert.equal(d.billing.billedTotalAmount, null);
        assert.equal(d.billing.riderCount, 3);
        assert.equal(d.billing.totalKm, 20);
        assert.equal(d.billing.totalAmount, 443 + 236);

        assert.deepEqual(d.attention, {
            ridersNeedingReview: 1,
            kmNeedsReview: 1,
            kmPending: 1,
            changedSinceClose: 0
        });

        assert.deepEqual(d.topRiders.map(r => r.riderId), ['YS-001', 'YS-002']);
        assert.equal(d.topRiders[0].totalAmount, 443);
        assert.equal(d.ridersNeedingReview[0].riderId, 'YS-BAD');
        assert.match(d.ridersNeedingReview[0].reason, /terminated date is missing/);
        assert.deepEqual(d.changedSinceClose, []);
    });

    it('shows changes made after the week was closed', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');
        const recordId = await h.createKmRecord({ vin: 'VIN-1', bikeId, usageDate: '2026-10-13', dailyKm: 20, status: 'Needs Review' });

        assert.equal((await h.api('POST', `/api/billing/weeks/${WEEK}/close`)).status, 201);

        await h.api('PATCH', `/api/daily-km/${recordId}/resolve`, {
            riderId: 'YS-001', reason: 'Late review'
        });

        const { dashboard: d } = (await dashboard()).body;

        assert.equal(d.billing.closed, true);
        assert.ok(d.billing.closedAt);
        assert.equal(d.billing.billedTotalAmount, 413);
        assert.equal(d.billing.totalAmount, 443);
        assert.equal(d.attention.changedSinceClose, 1);
        assert.deepEqual(d.changedSinceClose, [{
            riderId: 'YS-001',
            billedAmount: 413,
            currentAmount: 443,
            difference: 30
        }]);
    });

    it('an empty week returns zeros, not errors', async () => {
        const { dashboard: d } = (await dashboard()).body;

        assert.equal(d.riders.total, 0);
        assert.equal(d.bikes.total, 0);
        assert.equal(d.dailyKm.total, 0);
        assert.equal(d.billing.totalAmount, 0);
        assert.deepEqual(d.topRiders, []);
    });

    it('rejects a weekStart that is not a Monday', async () => {
        assert.equal((await dashboard('2026-10-14')).status, 400);
        assert.equal((await h.api('GET', '/api/dashboard')).status, 400);
    });
});
