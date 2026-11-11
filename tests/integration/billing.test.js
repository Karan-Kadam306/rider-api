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

    it('a bike still assigned is charged only up to today, not the rest of the week', async () => {
        const today = new Date(`${h.todayInIst()}T00:00:00.000Z`);
        const daysSinceMonday = (today.getUTCDay() + 6) % 7;
        today.setUTCDate(today.getUTCDate() - daysSinceMonday);
        const monday = today.toISOString().slice(0, 10);

        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', `${monday} 09:00`);

        const res = await riderBill('YS-001', monday);

        assert.equal(res.body.bill.rental.rentalDays, daysSinceMonday + 1);
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
        assert.equal(summary.totalKm, 20);
        assert.equal(summary.totalAmount, 443);
    });

    it('rejects a weekStart that is not a Monday', async () => {
        assert.equal((await h.api('GET', '/api/billing/summary?weekStart=2026-10-18')).status, 400);
    });
});

describe('Closing a billing week', () => {
    function closeWeek(weekStart = WEEK) {
        return h.api('POST', `/api/billing/weeks/${weekStart}/close`);
    }

    function summary(weekStart = WEEK) {
        return h.api('GET', `/api/billing/summary?weekStart=${weekStart}`);
    }

    // Monday of the current IST week, which has not ended yet.
    function currentMonday() {
        const today = new Date(`${h.todayInIst()}T00:00:00.000Z`);
        today.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
        return today.toISOString().slice(0, 10);
    }

    it('saves the bills; an unchanged week shows no differences', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');
        await h.createKmRecord({ vin: 'VIN-1', bikeId, riderId: 'YS-001', usageDate: '2026-10-13', dailyKm: 20, status: 'Validated' });

        const close = await closeWeek();

        assert.equal(close.status, 201);
        assert.equal(close.body.closure.riderCount, 1);
        assert.equal(close.body.closure.totalAmount, 443);

        const { body } = await summary();
        const rider = body.summary.riders[0];

        assert.equal(body.summary.closed, true);
        assert.equal(body.summary.billedTotalAmount, 443);
        assert.equal(body.summary.changedCount, 0);
        assert.equal(rider.changedSinceClose, false);
        assert.equal(rider.difference, 0);
        assert.equal(rider.billed.totalKm, 20);
    });

    it('a correction after closing is allowed and flagged with the difference', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');
        const recordId = await h.createKmRecord({ vin: 'VIN-1', bikeId, usageDate: '2026-10-13', dailyKm: 20, status: 'Needs Review' });

        assert.equal((await closeWeek()).status, 201);

        const resolve = await h.api('PATCH', `/api/daily-km/${recordId}/resolve`, {
            riderId: 'YS-001', reason: 'Late review'
        });
        assert.equal(resolve.status, 200);

        const { body } = await summary();
        const rider = body.summary.riders[0];

        assert.equal(body.summary.billedTotalAmount, 413);
        assert.equal(body.summary.totalAmount, 443);
        assert.equal(body.summary.changedCount, 1);
        assert.equal(rider.changedSinceClose, true);
        assert.equal(rider.difference, 30);

        const bill = (await riderBill('YS-001')).body.bill;

        assert.equal(bill.closed, true);
        assert.equal(bill.closure.billed.totalAmount, 413);
        assert.equal(bill.closure.changedSinceClose, true);
        assert.equal(bill.closure.difference, 30);
    });

    it('a rider added after closing is flagged as not billed', async () => {
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        const bike1 = await h.createBike('VIN-1');
        const bike2 = await h.createBike('VIN-2');
        await h.createAssignment(bike1, 'YS-001', '2026-10-01 09:00');

        assert.equal((await closeWeek()).status, 201);

        // A missed assignment is entered after the week was billed.
        await h.createAssignment(bike2, 'YS-002', '2026-10-15 09:00', '2026-10-16 18:00');

        const late = (await summary()).body.summary.riders.find(r => r.riderId === 'YS-002');

        assert.equal(late.billed, null);
        assert.equal(late.changedSinceClose, true);
        assert.equal(late.difference, 118);
    });

    it('a rider bill for an open week is not marked closed', async () => {
        await h.createRider('YS-001');

        const bill = (await riderBill('YS-001')).body.bill;

        assert.equal(bill.closed, false);
        assert.equal(bill.closure, null);
    });

    it('cannot close the same week twice', async () => {
        assert.equal((await closeWeek()).status, 201);
        assert.equal((await closeWeek()).status, 409);
    });

    it('cannot close a week that has not ended', async () => {
        const res = await closeWeek(currentMonday());

        assert.equal(res.status, 409);
        assert.match(res.body.error, /has not ended/);
    });

    it('cannot close while a rider requires review, and saves nothing', async () => {
        await h.createRider('YS-BAD', { status: 'Terminated' });
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-BAD', '2026-10-01 09:00');

        const res = await closeWeek();

        assert.equal(res.status, 409);
        assert.match(res.body.error, /require review/);
        assert.equal((await summary()).body.summary.closed, false);
    });

    it('rejects a weekStart that is not a Monday', async () => {
        assert.equal((await closeWeek('2026-10-13')).status, 400);
    });
});

describe('Weekly bills list', () => {
    function bills(query = '') {
        return h.api('GET', `/api/billing/bills?weekStart=${WEEK}${query}`);
    }

    // Three riders on bikes all week; YS-BAD is Terminated without a date, so it needs review.
    async function seedRiders() {
        for (const riderId of ['YS-001', 'YS-002', 'YS-BAD']) {
            await h.createRider(riderId, riderId === 'YS-BAD' ? { status: 'Terminated' } : {});
            const bikeId = await h.createBike(`VIN-${riderId}`);
            await h.createAssignment(bikeId, riderId, '2026-10-01 09:00');
        }
    }

    it('returns the week totals, view counts and one page of riders with names', async () => {
        await seedRiders();

        const res = await bills('&limit=2');

        assert.equal(res.status, 200);
        assert.equal(res.body.riderCount, 3);
        assert.equal(res.body.totalAmount, 826);
        assert.deepEqual(res.body.viewCounts, { all: 3, needsReview: 1, changed: 0, payoutPending: 0 });
        assert.deepEqual(res.body.pagination, { page: 1, limit: 2, offset: 0, totalRecords: 3, totalPages: 2 });
        assert.equal(res.body.count, 2);
        assert.equal(res.body.riders[0].riderName, 'Rider YS-001');

        const page2 = await bills('&limit=2&page=2');

        assert.equal(page2.body.count, 1);
        assert.equal(page2.body.riders[0].riderId, 'YS-BAD');
        assert.equal(page2.body.riders[0].riderStatus, 'Terminated');
    });

    it('filters by view and searches rider ID or name', async () => {
        await seedRiders();

        const review = await bills('&view=needsReview');

        assert.deepEqual(review.body.riders.map(r => r.riderId), ['YS-BAD']);
        assert.equal(review.body.pagination.totalRecords, 1);

        // Counts follow the search, so tabs show matching riders only.
        const search = await bills('&search=rider ys-00');

        assert.deepEqual(search.body.riders.map(r => r.riderId), ['YS-001', 'YS-002']);
        assert.deepEqual(search.body.viewCounts, { all: 2, needsReview: 0, changed: 0, payoutPending: 0 });
    });

    it('shows riders changed since the week closed', async () => {
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        const bike1 = await h.createBike('VIN-1');
        const bike2 = await h.createBike('VIN-2');
        await h.createAssignment(bike1, 'YS-001', '2026-10-01 09:00');

        assert.equal((await h.api('POST', `/api/billing/weeks/${WEEK}/close`)).status, 201);

        await h.createAssignment(bike2, 'YS-002', '2026-10-15 09:00', '2026-10-16 18:00');

        const res = await bills('&view=changed');

        assert.equal(res.body.closed, true);
        assert.equal(res.body.viewCounts.changed, 1);
        assert.deepEqual(res.body.riders.map(r => r.riderId), ['YS-002']);
        assert.equal(res.body.riders[0].difference, 118);
    });

    it('rejects an unknown view and a bad page or limit', async () => {
        assert.equal((await bills('&view=paid')).status, 400);
        assert.equal((await bills('&page=0')).status, 400);
        assert.equal((await bills('&limit=101')).status, 400);
        assert.equal((await h.api('GET', '/api/billing/bills?weekStart=2026-10-13')).status, 400);
    });
});

describe('Weekly bills export', () => {
    function exportBills(query = '') {
        return h.api('GET', `/api/billing/bills/export?weekStart=${WEEK}${query}`);
    }

    it('downloads every rider as CSV with the same amounts as the bills list', async () => {
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        // A name with a comma and a quote must stay in one column.
        await h.pool.query(`UPDATE riders SET name = 'Shah, "Raj"' WHERE rider_id = 'YS-002'`);

        const bike1 = await h.createBike('VIN-1');
        const bike2 = await h.createBike('VIN-2');
        await h.createAssignment(bike1, 'YS-001', '2026-10-01 09:00');
        await h.createAssignment(bike2, 'YS-002', '2026-10-15 09:00', '2026-10-16 18:00');
        await h.createKmRecord({ vin: 'VIN-1', bikeId: bike1, riderId: 'YS-001', usageDate: '2026-10-13', dailyKm: 20, status: 'Validated' });

        const res = await exportBills();

        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type'), /^text\/csv/);
        assert.match(res.headers.get('content-disposition'), /attachment; filename="billing-2026-10-12\.csv"/);

        const lines = res.body.replace(/^﻿/, '').trim().split('\r\n');

        assert.equal(lines.length, 3);
        assert.equal(lines[0], 'Rider ID,Rider Name,Rider Status,Rental Days,Rental (INR),KM,Energy (INR),Total (INR),Earnings (INR),Previous Balance (INR),Net Payout (INR),Needs Review,Review Reason');
        assert.equal(lines[1], 'YS-001,Rider YS-001,Active,7,413,20,30,443,0,0,-443,No,');
        assert.equal(lines[2], 'YS-002,"Shah, ""Raj""",Active,2,118,0,0,118,0,0,-118,No,');
    });

    it('applies the view and adds billed columns for a closed week', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');

        assert.equal((await h.api('POST', `/api/billing/weeks/${WEEK}/close`)).status, 201);

        const lines = (await exportBills()).body.replace(/^﻿/, '').trim().split('\r\n');

        assert.match(lines[0], /,Billed Total \(INR\),Difference \(INR\),Changed Since Close$/);
        assert.match(lines[1], /,413,0,No$/);

        const changed = (await exportBills('&view=changed')).body.replace(/^﻿/, '').trim().split('\r\n');

        assert.equal(changed.length, 1);
    });

    it('stops spreadsheet formulas in rider names', async () => {
        await h.createRider('YS-001');
        await h.pool.query(`UPDATE riders SET name = '=SUM(A1)' WHERE rider_id = 'YS-001'`);
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');

        const lines = (await exportBills()).body.replace(/^﻿/, '').trim().split('\r\n');

        assert.match(lines[1], /^YS-001,'=SUM\(A1\),/);
    });
});
