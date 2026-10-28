const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

const WEEK = '2026-10-12'; // Monday

function riderBill(riderId, weekStart = WEEK) {
    return h.api('GET', `/api/billing/riders/${riderId}?weekStart=${weekStart}`);
}

describe('Rider weekly bill', () => {
    it('terminated Wednesday: 3 days × ₹59 + 20 km × ₹1.50 = ₹207', async () => {
        await h.createRider('YS-001', { status: 'Terminated', terminatedOn: '2026-10-14' });
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');

        // Only the validated record before termination is billed.
        await h.createKmRecord({ vin: 'VIN-1', bikeId, riderId: 'YS-001', usageDate: '2026-10-13', dailyKm: 20, status: 'Validated' });
        await h.createKmRecord({ vin: 'VIN-1', bikeId, riderId: 'YS-001', usageDate: '2026-10-12', dailyKm: 18, status: 'Pending' });
        await h.createKmRecord({ vin: 'VIN-1', bikeId, riderId: 'YS-001', usageDate: '2026-10-14', dailyKm: 40, status: 'Needs Review' });
        await h.createKmRecord({ vin: 'VIN-1', bikeId, riderId: 'YS-001', usageDate: '2026-10-16', dailyKm: 10, status: 'Validated' });

        const res = await riderBill('YS-001');

        assert.equal(res.status, 200);
        assert.equal(res.body.bill.rental.rentalDays, 3);
        assert.equal(res.body.bill.rental.totalRental, 177);
        assert.equal(res.body.bill.energy.totalEnergyCharge, 30);
        assert.equal(res.body.bill.totalAmount, 207);
    });

    it('bike swap mid-day is charged once', async () => {
        await h.createRider('YS-001');
        const bike1 = await h.createBike('VIN-1');
        const bike2 = await h.createBike('VIN-2');
        await h.createAssignment(bike1, 'YS-001', '2026-10-12 09:00', '2026-10-12 13:00');
        await h.createAssignment(bike2, 'YS-001', '2026-10-12 14:00', '2026-10-13 18:00');

        const res = await riderBill('YS-001');

        assert.equal(res.body.bill.rental.rentalDays, 2);
        assert.equal(res.body.bill.rental.totalRental, 118);
    });

    it('uses IST day boundaries: a 02:00 IST return still counts that day', async () => {
        // 2026-10-14 02:00 IST is still 2026-10-13 in UTC.
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00', '2026-10-14 02:00');

        const res = await riderBill('YS-001');

        assert.equal(res.body.bill.rental.rentalDays, 3);
    });

    it('charges the resolved rider when two riders shared a bike that day', async () => {
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-13 08:00', '2026-10-13 12:00');
        await h.createAssignment(bikeId, 'YS-002', '2026-10-13 13:00');

        const recordId = await h.createKmRecord({ vin: 'VIN-1', bikeId, usageDate: '2026-10-13', dailyKm: 20, status: 'Needs Review' });

        const resolve = await h.api('PATCH', `/api/daily-km/${recordId}/resolve`, {
            riderId: 'YS-002', reason: 'Afternoon rider did the trips'
        });
        assert.equal(resolve.status, 200);

        assert.equal((await riderBill('YS-002')).body.bill.energy.totalEnergyCharge, 30);
        assert.equal((await riderBill('YS-001')).body.bill.energy.totalEnergyCharge, 0);
    });

    it('rejects a weekStart that is not a Monday', async () => {
        assert.equal((await riderBill('YS-001', '2026-10-13')).status, 400);
    });

    it('returns 404 for an unknown rider', async () => {
        assert.equal((await riderBill('NOPE')).status, 404);
    });
});

describe('Weekly billing summary', () => {
    it('a rider with bad data is flagged; other riders are still billed', async () => {
        await h.createRider('YS-001');
        // Corrupt data: Terminated without terminated_on.
        await h.createRider('YS-BAD', { status: 'Terminated' });

        const bike1 = await h.createBike('VIN-1');
        const bike2 = await h.createBike('VIN-2');
        await h.createAssignment(bike1, 'YS-001', '2026-10-01 09:00');
        await h.createAssignment(bike2, 'YS-BAD', '2026-10-01 09:00');
        await h.createKmRecord({ vin: 'VIN-1', bikeId: bike1, riderId: 'YS-001', usageDate: '2026-10-13', dailyKm: 20, status: 'Validated' });

        const res = await h.api('GET', `/api/billing/summary?weekStart=${WEEK}`);

        assert.equal(res.status, 200);

        const { summary } = res.body;
        const good = summary.riders.find(r => r.riderId === 'YS-001');
        const bad = summary.riders.find(r => r.riderId === 'YS-BAD');

        assert.equal(good.totalAmount, 413 + 30);
        assert.equal(bad.requiresReview, true);
        assert.match(bad.reason, /terminated date is missing/);
        assert.equal(summary.reviewCount, 1);
        assert.equal(summary.totalAmount, 443);
    });

    it('rejects a weekStart that is not a Monday', async () => {
        assert.equal((await h.api('GET', '/api/billing/summary?weekStart=2026-10-18')).status, 400);
    });
});
