const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

const WEEK = '2026-10-12'; // Monday

function periods(riderId = 'YS-001') {
    return `/api/riders/${riderId}/inactive-periods`;
}

function addPeriod(startDate, endDate, riderId = 'YS-001') {
    return h.api('POST', periods(riderId), { startDate, endDate });
}

function approve(periodId, riderId = 'YS-001') {
    return h.api('PATCH', `${periods(riderId)}/${periodId}/approve`);
}

async function rentalDays(riderId = 'YS-001') {
    const res = await h.api('GET', `/api/billing/riders/${riderId}?weekStart=${WEEK}`);
    return res.body.bill.rental.rentalDays;
}

// YS-001 has a bike all week: 7 rental days before any inactive period.
async function riderWithBikeAllWeek() {
    await h.createRider('YS-001');
    const bikeId = await h.createBike('VIN-1');
    await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');
    return bikeId;
}

describe('Inactive periods and rental', () => {
    it('a pending period is still charged; once approved its days are not', async () => {
        await riderWithBikeAllWeek();

        const created = await addPeriod('2026-10-13', '2026-10-14');

        assert.equal(created.status, 201);
        assert.equal(created.body.period.approved, false);
        assert.equal(await rentalDays(), 7);

        const approved = await approve(created.body.period.periodId);

        assert.equal(approved.status, 200);
        assert.equal(approved.body.period.approved, true);
        assert.equal(await rentalDays(), 5);
    });

    it('a day without a bike is never charged, inactive or not', async () => {
        // Bike only Mon–Wed; approved inactive Wed–Fri. Charged: Mon, Tue.
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-12 09:00', '2026-10-14 18:00');

        const { body } = await addPeriod('2026-10-14', '2026-10-16');
        await approve(body.period.periodId);

        assert.equal(await rentalDays(), 2);
    });

    it('only the days of a period inside the week are exempt', async () => {
        await riderWithBikeAllWeek();

        // Sat 10 Oct – Tue 13 Oct: Mon and Tue fall in the week.
        const { body } = await addPeriod('2026-10-10', '2026-10-13');
        await approve(body.period.periodId);

        assert.equal(await rentalDays(), 5);
    });

    it('removing an approved period charges its days again', async () => {
        await riderWithBikeAllWeek();
        const { body } = await addPeriod('2026-10-13', '2026-10-13');
        await approve(body.period.periodId);
        assert.equal(await rentalDays(), 6);

        const removed = await h.api('DELETE', `${periods()}/${body.period.periodId}`);

        assert.equal(removed.status, 200);
        assert.equal(await rentalDays(), 7);
    });

    it('an approval after the payout shows as a pending payout change', async () => {
        await riderWithBikeAllWeek();
        assert.equal((await h.api('POST', `/api/payouts/weeks/${WEEK}/run`)).status, 201);

        const { body } = await addPeriod('2026-10-15', '2026-10-16');
        await approve(body.period.periodId);

        const bills = (await h.api('GET', `/api/billing/bills?weekStart=${WEEK}`)).body;

        assert.equal(bills.payout.pendingCount, 1);
        assert.equal(bills.payout.pendingDifference, -118);
        assert.equal(bills.riders[0].payout.totalAmount, 413);
        assert.equal(bills.riders[0].totalAmount, 295);
    });
});

describe('Managing inactive periods', () => {
    it('lists a rider\'s periods, latest first', async () => {
        await h.createRider('YS-001');
        await addPeriod('2026-10-01', '2026-10-02');
        await addPeriod('2026-10-20', '2026-10-21');

        const res = await h.api('GET', periods());

        assert.equal(res.status, 200);
        assert.equal(res.body.count, 2);
        assert.deepEqual(res.body.periods.map(p => p.startDate), ['2026-10-20', '2026-10-01']);
    });

    it('rejects a period that overlaps another one', async () => {
        await h.createRider('YS-001');
        assert.equal((await addPeriod('2026-10-13', '2026-10-15')).status, 201);

        const res = await addPeriod('2026-10-15', '2026-10-18');

        assert.equal(res.status, 409);
        assert.match(res.body.error, /Overlaps the existing inactive period 2026-10-13 to 2026-10-15/);
    });

    it('rejects bad dates', async () => {
        await h.createRider('YS-001');

        assert.equal((await addPeriod('2026-10-15', '2026-10-13')).status, 400);
        assert.equal((await addPeriod('2026-02-30', '2026-03-01')).status, 400);
        assert.equal((await h.api('POST', periods(), {})).status, 400);
    });

    it('rejects a terminated rider and an unknown rider', async () => {
        await h.createRider('YS-T', { status: 'Terminated', terminatedOn: '2026-10-01' });

        assert.equal((await addPeriod('2026-10-13', '2026-10-14', 'YS-T')).status, 409);
        assert.equal((await addPeriod('2026-10-13', '2026-10-14', 'NOPE')).status, 404);
        assert.equal((await h.api('GET', periods('NOPE'))).status, 404);
    });

    it('approving twice, or a missing period, is refused', async () => {
        await h.createRider('YS-001');
        const { body } = await addPeriod('2026-10-13', '2026-10-14');

        assert.equal((await approve(body.period.periodId)).status, 200);
        assert.equal((await approve(body.period.periodId)).status, 409);
        assert.equal((await approve(9999)).status, 404);
        assert.equal((await approve('abc')).status, 400);
        assert.equal((await h.api('DELETE', `${periods()}/9999`)).status, 404);
    });

    it('a period of another rider cannot be approved through this rider', async () => {
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        const { body } = await addPeriod('2026-10-13', '2026-10-14', 'YS-002');

        assert.equal((await approve(body.period.periodId, 'YS-001')).status, 404);
    });
});
