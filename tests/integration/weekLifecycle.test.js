// One billing week from start to finish, only through the API:
// CSV imports → review → validation → bills → inactive days → payout → correction → re-trigger → close.
const h = require('../helpers');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

before(async () => {
    await h.startServer();
    await h.resetDb();
});
after(h.stopServer);

const WEEK = '2026-10-12'; // Mon 12 – Sun 18 Oct

function upload(workDate, csv) {
    const form = new FormData();
    form.append('type', 'daily_km');
    form.append('workDate', workDate);
    form.append('file', new Blob([csv], { type: 'text/csv' }), `km-${workDate}.csv`);
    return h.api('POST', '/api/imports', form);
}

function validateWeek() {
    return h.api('POST', '/api/daily-km/validate', { fromDate: WEEK, toDate: '2026-10-18' });
}

async function bills() {
    const res = await h.api('GET', `/api/billing/bills?weekStart=${WEEK}&limit=100`);
    assert.equal(res.status, 200);
    return res.body;
}

function totalsByRider(list) {
    return Object.fromEntries(list.riders.map(rider => [rider.riderId, rider.totalAmount]));
}

describe('A full billing week', () => {
    it('runs from import to a closed, re-paid week with the right amounts at every step', async () => {
        // ---- Riders and bikes ----
        // YS-001: VIN-1 all week.
        // YS-002: VIN-2 Mon–Wed, terminated Wed.
        // YS-003 / YS-004: share VIN-3 on Tue (YS-003 morning, YS-004 from afternoon on).
        // YS-005: swaps VIN-4 → VIN-5 on Thu (charged once that day).
        for (const id of ['YS-001', 'YS-003', 'YS-004', 'YS-005']) {
            await h.createRider(id);
        }
        await h.createRider('YS-002', { status: 'Terminated', terminatedOn: '2026-10-14' });

        const vin = {};
        for (const name of ['VIN-1', 'VIN-2', 'VIN-3', 'VIN-4', 'VIN-5']) {
            vin[name] = await h.createBike(name);
        }

        await h.createAssignment(vin['VIN-1'], 'YS-001', '2026-10-01 09:00');
        await h.createAssignment(vin['VIN-2'], 'YS-002', '2026-10-01 09:00', '2026-10-14 18:00');
        await h.createAssignment(vin['VIN-3'], 'YS-003', '2026-10-13 08:00', '2026-10-13 12:00');
        await h.createAssignment(vin['VIN-3'], 'YS-004', '2026-10-13 13:00');
        await h.createAssignment(vin['VIN-4'], 'YS-005', '2026-10-15 09:00', '2026-10-15 13:00');
        await h.createAssignment(vin['VIN-5'], 'YS-005', '2026-10-15 14:00');

        // ---- Daily KM imports ----
        const tue = await upload('2026-10-13', 'VIN,KM\nVIN-1,20\nVIN-2,10\nVIN-3,30\n');
        assert.equal(tue.status, 201);
        assert.equal(tue.body.import.successRows, 3);

        const fri = await upload('2026-10-16', 'VIN,KM\nVIN-1,10\nVIN-5,40\n');
        assert.equal(fri.status, 201);

        // VIN-3 had two riders on Tue, so it needs review; the rest wait for validation.
        const km = (await h.api('GET', `/api/daily-km?fromDate=${WEEK}&toDate=2026-10-18`)).body;
        assert.deepEqual(km.statusCounts, { Pending: 4, Validated: 0, 'Needs Review': 1 });

        // Pending KM is not charged yet: rental only.
        assert.equal((await bills()).totalEnergyCharge, 0);

        // ---- Review and validation ----
        const shared = km.records.find(record => record.reported_vin === 'VIN-3');
        const resolve = await h.api('PATCH', `/api/daily-km/${shared.km_record_id}/resolve`, {
            riderId: 'YS-004', reason: 'Afternoon rider did the trips'
        });
        assert.equal(resolve.status, 200);
        assert.equal((await validateWeek()).body.validated, 4);

        // ---- Bills ----
        let list = await bills();
        assert.deepEqual(totalsByRider(list), {
            'YS-001': 458, // 7 × 59 + 30 km × 1.50
            'YS-002': 192, // Mon–Wed (terminated Wed) + 10 km
            'YS-003': 59, // Tue only, no KM charged
            'YS-004': 399, // Tue–Sun + 30 km (resolved to YS-004)
            'YS-005': 296 // Thu–Sun, swap charged once + 40 km
        });
        assert.equal(list.reviewCount, 0);

        // ---- Approved inactive days: YS-001 off Sat–Sun ----
        const period = await h.api('POST', '/api/riders/YS-001/inactive-periods', {
            startDate: '2026-10-17', endDate: '2026-10-18'
        });
        assert.equal(period.status, 201);
        assert.equal(
            (await h.api('PATCH', `/api/riders/YS-001/inactive-periods/${period.body.period.periodId}/approve`)).status,
            200
        );
        assert.equal(totalsByRider(await bills())['YS-001'], 340); // 5 × 59 + 45

        // ---- First payout ----
        const run1 = await h.api('POST', `/api/payouts/weeks/${WEEK}/run`);
        assert.equal(run1.status, 201);
        assert.equal(run1.body.run.updatedCount, 5);
        assert.equal(run1.body.run.totalAmount, 1286);

        // ---- Correction: VIN-1 on Fri re-uploaded as 16 km (was 10) ----
        const corrected = await upload('2026-10-16', 'VIN,KM\nVIN-1,16\nVIN-5,40\n');
        assert.equal(corrected.body.import.resultSummary.corrected, 1);
        assert.equal(corrected.body.import.resultSummary.unchanged, 1);

        // The corrected record is Pending again, so Fri is not charged until it is validated.
        list = await bills();
        assert.equal(totalsByRider(list)['YS-001'], 325);
        assert.equal(list.payout.pendingCount, 1);

        assert.equal((await validateWeek()).body.validated, 1);
        list = await bills();
        assert.equal(totalsByRider(list)['YS-001'], 349); // 26 km now
        assert.equal(list.payout.pendingDifference, 9);

        // ---- Re-trigger: only YS-001 changes ----
        const run2 = await h.api('POST', `/api/payouts/weeks/${WEEK}/run`);
        assert.equal(run2.status, 201);
        assert.equal(run2.body.run.updatedCount, 1);
        assert.equal(run2.body.run.totalAmount, 1295);

        list = await bills();
        const runOf = id => list.riders.find(rider => rider.riderId === id).payout.updatedRunNumber;
        assert.equal(runOf('YS-001'), 2);
        assert.equal(runOf('YS-004'), 1);
        assert.equal(list.payout.pendingCount, 0);

        // ---- Close the week; a later correction shows on both close and payout ----
        assert.equal((await h.api('POST', `/api/billing/weeks/${WEEK}/close`)).status, 201);

        await upload('2026-10-13', 'VIN,KM\nVIN-1,24\nVIN-2,10\nVIN-3,30\n');
        await validateWeek();

        list = await bills();
        assert.equal(list.changedCount, 1);
        assert.equal(list.payout.pendingCount, 1);
        assert.equal(list.payout.pendingDifference, 6);

        // ---- The dashboard agrees ----
        const dashboard = (await h.api('GET', `/api/dashboard?weekStart=${WEEK}`)).body.dashboard;
        assert.equal(dashboard.billing.totalAmount, list.totalAmount);
        assert.equal(dashboard.payout.totalAmount, 1295);
        assert.equal(dashboard.attention.payoutChanges, 1);
        assert.equal(dashboard.attention.changedSinceClose, 1);
    });
});
