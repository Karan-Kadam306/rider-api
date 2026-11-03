const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

const WEEK = '2026-10-12'; // Monday, long ended

function weekPayout(weekStart = WEEK) {
    return h.api('GET', `/api/payouts/weeks/${weekStart}`);
}

function triggerPayout(weekStart = WEEK) {
    return h.api('POST', `/api/payouts/weeks/${weekStart}/run`);
}

function bills(query = '') {
    return h.api('GET', `/api/billing/bills?weekStart=${WEEK}${query}`);
}

// YS-001: full week + 20 km = ₹443. YS-002: Thu–Fri = ₹118.
async function seedWeek() {
    await h.createRider('YS-001');
    await h.createRider('YS-002');
    const bike1 = await h.createBike('VIN-1');
    const bike2 = await h.createBike('VIN-2');
    await h.createAssignment(bike1, 'YS-001', '2026-10-01 09:00');
    await h.createAssignment(bike2, 'YS-002', '2026-10-15 09:00', '2026-10-16 18:00');
    await h.createKmRecord({ vin: 'VIN-1', bikeId: bike1, riderId: 'YS-001', usageDate: '2026-10-13', dailyKm: 20, status: 'Validated' });

    return { bike1, bike2 };
}

describe('Before the first payout', () => {
    it('payout columns are empty and the preview lists every rider', async () => {
        await seedWeek();

        const list = (await bills()).body;

        assert.equal(list.payout.paid, false);
        assert.equal(list.payout.totalAmount, null);
        assert.equal(list.payout.pendingCount, 0);
        assert.ok(list.riders.every(r => r.payout === null && r.payoutPending === false));

        const { payout } = (await weekPayout()).body;

        assert.equal(payout.paid, false);
        assert.equal(payout.deductedTotalAmount, null);
        assert.equal(payout.changeCount, 2);
        assert.equal(payout.changeDifference, 561);
        assert.equal(payout.blocker, null);
        assert.equal(payout.changes[0].riderName, 'Rider YS-001');
        assert.deepEqual(payout.runs, []);
    });

    it('cannot trigger a payout for a week that has not ended', async () => {
        const today = new Date(`${h.todayInIst()}T00:00:00.000Z`);
        today.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
        const monday = today.toISOString().slice(0, 10);

        const res = await triggerPayout(monday);

        assert.equal(res.status, 409);
        assert.match(res.body.error, /once the week has ended/);
    });

    it('cannot trigger while a rider requires review, and saves nothing', async () => {
        await seedWeek();
        await h.createRider('YS-BAD', { status: 'Terminated' });
        const bike = await h.createBike('VIN-BAD');
        await h.createAssignment(bike, 'YS-BAD', '2026-10-01 09:00');

        const res = await triggerPayout();

        assert.equal(res.status, 409);
        assert.match(res.body.error, /1 rider\(s\) require review/);
        assert.equal((await weekPayout()).body.payout.paid, false);
    });

    it('rejects a weekStart that is not a Monday', async () => {
        assert.equal((await triggerPayout('2026-10-13')).status, 400);
        assert.equal((await weekPayout('2026-10-13')).status, 400);
    });
});

describe('Triggering a payout', () => {
    it('the first payout deducts from every rider and fills the payout columns', async () => {
        await seedWeek();

        const res = await triggerPayout();

        assert.equal(res.status, 201);
        assert.equal(res.body.run.runNumber, 1);
        assert.equal(res.body.run.riderCount, 2);
        assert.equal(res.body.run.updatedCount, 2);
        assert.equal(res.body.run.totalAmount, 561);
        assert.equal(res.body.previousTotalAmount, null);

        const list = (await bills()).body;
        const rider = list.riders.find(r => r.riderId === 'YS-001');

        assert.equal(list.payout.paid, true);
        assert.equal(list.payout.totalAmount, 561);
        assert.equal(list.payout.pendingCount, 0);
        assert.equal(rider.payout.totalAmount, 443);
        assert.equal(rider.payout.totalKm, 20);
        assert.equal(rider.payout.updatedRunNumber, 1);
        assert.equal(rider.payout.previousTotalAmount, null);
        assert.equal(rider.payoutPending, false);
    });

    it('re-triggering without changes is refused', async () => {
        await seedWeek();
        assert.equal((await triggerPayout()).status, 201);

        const res = await triggerPayout();

        assert.equal(res.status, 409);
        assert.match(res.body.error, /Nothing has changed/);
        assert.equal((await weekPayout()).body.payout.blocker, 'Nothing has changed since the last payout');
    });

    it('a correction is pending until re-triggered; only the changed rider is updated', async () => {
        const { bike1 } = await seedWeek();
        assert.equal((await triggerPayout()).status, 201);

        // 20 more km for YS-001 after the payout: +₹30.
        await h.createKmRecord({ vin: 'VIN-1', bikeId: bike1, riderId: 'YS-001', usageDate: '2026-10-14', dailyKm: 20, status: 'Validated' });

        const pending = (await bills('&view=payoutPending')).body;

        assert.equal(pending.payout.pendingCount, 1);
        assert.equal(pending.payout.pendingDifference, 30);
        assert.deepEqual(pending.riders.map(r => r.riderId), ['YS-001']);
        // The paid value stays as it was until the payout is re-triggered.
        assert.equal(pending.riders[0].payout.totalAmount, 443);
        assert.equal(pending.riders[0].totalAmount, 473);

        const preview = (await weekPayout()).body.payout;

        assert.equal(preview.changeCount, 1);
        assert.equal(preview.changes[0].paid.totalAmount, 443);
        assert.equal(preview.changes[0].current.totalAmount, 473);

        const rerun = await triggerPayout();

        assert.equal(rerun.status, 201);
        assert.equal(rerun.body.run.runNumber, 2);
        assert.equal(rerun.body.run.updatedCount, 1);
        assert.equal(rerun.body.run.totalAmount, 591);
        assert.equal(rerun.body.previousTotalAmount, 561);
        assert.deepEqual(rerun.body.updated, [{ riderId: 'YS-001', previousAmount: 443, totalAmount: 473, difference: 30 }]);

        const riders = (await bills()).body.riders;
        const changed = riders.find(r => r.riderId === 'YS-001');
        const unchanged = riders.find(r => r.riderId === 'YS-002');

        assert.equal(changed.payout.totalAmount, 473);
        assert.equal(changed.payout.previousTotalAmount, 443);
        assert.equal(changed.payout.updatedRunNumber, 2);
        assert.equal(unchanged.payout.totalAmount, 118);
        assert.equal(unchanged.payout.updatedRunNumber, 1);
        assert.equal(unchanged.payout.previousTotalAmount, null);

        const { runs } = (await weekPayout()).body.payout;

        assert.deepEqual(runs.map(r => r.runNumber), [2, 1]);
    });

    it('a rider whose bill disappears after the payout is updated to zero', async () => {
        await seedWeek();
        assert.equal((await triggerPayout()).status, 201);

        await h.pool.query(`DELETE FROM bike_assignments WHERE rider_id = 'YS-002'`);

        const removed = (await bills()).body.riders.find(r => r.riderId === 'YS-002');

        assert.equal(removed.totalAmount, 0);
        assert.equal(removed.payout.totalAmount, 118);
        assert.equal(removed.payoutPending, true);

        const rerun = await triggerPayout();

        assert.equal(rerun.status, 201);
        assert.equal(rerun.body.run.totalAmount, 443);
        assert.deepEqual(rerun.body.updated.map(u => [u.riderId, u.totalAmount]), [['YS-002', 0]]);
    });

    it('works on a closed week too', async () => {
        await seedWeek();
        assert.equal((await h.api('POST', `/api/billing/weeks/${WEEK}/close`)).status, 201);

        assert.equal((await triggerPayout()).status, 201);
    });

    it('shows on the dashboard and in the recent payouts list', async () => {
        const { bike1 } = await seedWeek();
        assert.equal((await triggerPayout()).status, 201);
        await h.createKmRecord({ vin: 'VIN-1', bikeId: bike1, riderId: 'YS-001', usageDate: '2026-10-14', dailyKm: 10, status: 'Validated' });

        const d = (await h.api('GET', `/api/dashboard?weekStart=${WEEK}`)).body.dashboard;

        assert.equal(d.payout.paid, true);
        assert.equal(d.payout.runCount, 1);
        assert.equal(d.payout.totalAmount, 561);
        assert.equal(d.attention.payoutChanges, 1);

        const recent = (await h.api('GET', '/api/payouts/recent?limit=5')).body;

        assert.equal(recent.count, 1);
        assert.equal(recent.runs[0].weekStart, WEEK);
        assert.equal((await h.api('GET', '/api/payouts/recent?limit=0')).status, 400);
    });

    it('the export adds the paid amount once a payout exists', async () => {
        await seedWeek();

        const before = (await h.api('GET', `/api/billing/bills/export?weekStart=${WEEK}`)).body;
        assert.doesNotMatch(before, /Deducted/);

        assert.equal((await triggerPayout()).status, 201);

        const lines = (await h.api('GET', `/api/billing/bills/export?weekStart=${WEEK}`)).body
            .replace(/^﻿/, '').trim().split('\r\n');

        assert.match(lines[0], /,Deducted \(INR\),Payout Pending$/);
        assert.match(lines[1], /^YS-001,.*,443,No$/);
    });
});
