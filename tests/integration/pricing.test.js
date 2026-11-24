const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

const WEEK = '2026-10-12';

function addRate(rentalPerDay, energyPerKm, effectiveFrom) {
    return h.api('POST', '/api/pricing/postpaid-rates', { rentalPerDay, energyPerKm, effectiveFrom });
}

describe('Postpaid rates', () => {
    it('starts with ₹59/day and ₹1.50/km', async () => {
        const res = await h.api('GET', '/api/pricing');

        assert.equal(res.status, 200);
        assert.equal(res.body.currentPostpaidRate.rentalPerDay, 59);
        assert.equal(res.body.currentPostpaidRate.energyPerKm, 1.5);
        assert.equal(res.body.currentDeposit, null);
        assert.deepEqual(res.body.prepaidPacks, []);
    });

    it('charges each day and each KM record at the rate in effect that day', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-12 09:00', '2026-10-18 20:00');
        await h.createKmRecord({ vin: 'VIN-1', bikeId, riderId: 'YS-001', usageDate: '2026-10-13', dailyKm: 10, status: 'Validated' });
        await h.createKmRecord({ vin: 'VIN-1', bikeId, riderId: 'YS-001', usageDate: '2026-10-16', dailyKm: 10, status: 'Validated' });

        const added = await addRate(65, 2, '2026-10-15');
        const bill = (await h.api('GET', `/api/billing/riders/YS-001?weekStart=${WEEK}`)).body.bill;
        const bills = (await h.api('GET', `/api/billing/bills?weekStart=${WEEK}`)).body;

        assert.equal(added.status, 201);
        // Mon–Wed at ₹59, Thu–Sun at ₹65; 10 km at ₹1.50, then 10 km at ₹2.
        assert.equal(bill.rental.totalRental, 3 * 59 + 4 * 65);
        assert.equal(bill.rental.dailyRate, null);
        assert.equal(bill.energy.totalEnergyCharge, 35);
        assert.deepEqual(bills.postpaidRates, [
            { effectiveFrom: '2000-01-01', rentalPerDay: 59, energyPerKm: 1.5 },
            { effectiveFrom: '2026-10-15', rentalPerDay: 65, energyPerKm: 2 }
        ]);
    });

    it('must start after the newest rate', async () => {
        await addRate(65, 2, '2026-10-15');

        const same = await addRate(70, 2, '2026-10-15');
        const earlier = await addRate(70, 2, '2026-10-01');

        assert.equal(same.status, 409);
        assert.equal(earlier.status, 409);
    });

    it('cannot change a week that was closed or paid out', async () => {
        await h.pool.query(`INSERT INTO billing_week_closures (week_start, total_amount) VALUES ($1, 0)`, [WEEK]);

        const inClosedWeek = await addRate(65, 2, '2026-10-18');
        const afterIt = await addRate(65, 2, '2026-10-19');

        assert.equal(inClosedWeek.status, 409);
        assert.match(inClosedWeek.body.error, /2026-10-19/);
        assert.equal(afterIt.status, 201);
    });

    it('rejects bad amounts and dates', async () => {
        for (const [rental, energy, date] of [[0, 1.5, '2027-01-01'], [59.999, 1.5, '2027-01-01'], ['59', 1.5, '2027-01-01'], [59, -1, '2027-01-01'], [59, 1.5, '2027-02-30']]) {
            const res = await addRate(rental, energy, date);
            assert.equal(res.status, 400, JSON.stringify([rental, energy, date]));
        }
    });

    it('removes only a rate that has not started', async () => {
        const started = await addRate(65, 2, h.todayInIst());
        const scheduled = await addRate(70, 2, h.addDays(h.todayInIst(), 10));

        const removeStarted = await h.api('DELETE', `/api/pricing/postpaid-rates/${started.body.rate.rateId}`);
        const removeScheduled = await h.api('DELETE', `/api/pricing/postpaid-rates/${scheduled.body.rate.rateId}`);
        const pricing = (await h.api('GET', '/api/pricing')).body;

        assert.equal(removeStarted.status, 409);
        assert.equal(removeScheduled.status, 200);
        assert.equal(pricing.currentPostpaidRate.rentalPerDay, 65);
        assert.deepEqual(pricing.postpaidRates.map(rate => rate.rentalPerDay), [65, 59]);
    });
});

describe('Deposit amount', () => {
    it('applies from its start date and cannot start in the past', async () => {
        const today = h.todayInIst();

        const past = await h.api('POST', '/api/pricing/deposits', { amount: 2000, effectiveFrom: h.addDays(today, -1) });
        const now = await h.api('POST', '/api/pricing/deposits', { amount: 2000, effectiveFrom: today });
        const later = await h.api('POST', '/api/pricing/deposits', { amount: 2500, effectiveFrom: h.addDays(today, 5) });
        const pricing = (await h.api('GET', '/api/pricing')).body;

        assert.equal(past.status, 400);
        assert.equal(now.status, 201);
        assert.equal(later.status, 201);
        assert.equal(pricing.currentDeposit.amount, 2000);
        assert.equal(pricing.depositAmounts.length, 2);
    });

    it('removes only an amount that has not started', async () => {
        const today = h.todayInIst();
        const now = await h.api('POST', '/api/pricing/deposits', { amount: 2000, effectiveFrom: today });
        const later = await h.api('POST', '/api/pricing/deposits', { amount: 2500, effectiveFrom: h.addDays(today, 5) });

        const removeNow = await h.api('DELETE', `/api/pricing/deposits/${now.body.deposit.depositId}`);
        const removeLater = await h.api('DELETE', `/api/pricing/deposits/${later.body.deposit.depositId}`);

        assert.equal(removeNow.status, 409);
        assert.equal(removeLater.status, 200);
    });
});

describe('Prepaid packs', () => {
    it('creates weekly packs (always 7 days) and top-ups', async () => {
        const weekly = await h.api('POST', '/api/pricing/packs', { kind: 'Weekly', name: '400 KM Weekly', price: 1000, kmIncluded: 400 });
        const topUp = await h.api('POST', '/api/pricing/packs', { kind: 'TopUp', name: '100 KM Top-up', price: 300, kmIncluded: 100, validityDays: 3 });
        const shortWeekly = await h.api('POST', '/api/pricing/packs', { kind: 'Weekly', name: 'Short', price: 500, kmIncluded: 100, validityDays: 3 });
        const topUpWithoutDays = await h.api('POST', '/api/pricing/packs', { kind: 'TopUp', name: 'No days', price: 100, kmIncluded: 20 });
        const duplicate = await h.api('POST', '/api/pricing/packs', { kind: 'TopUp', name: '400 km weekly', price: 100, kmIncluded: 20, validityDays: 1 });

        assert.equal(weekly.status, 201);
        assert.equal(weekly.body.pack.validityDays, 7);
        assert.equal(topUp.status, 201);
        assert.equal(shortWeekly.status, 400);
        assert.equal(topUpWithoutDays.status, 400);
        assert.equal(duplicate.status, 409);
    });

    it('updates a pack and deactivates it', async () => {
        const created = await h.api('POST', '/api/pricing/packs', { kind: 'Weekly', name: '400 KM Weekly', price: 1000, kmIncluded: 400 });

        const res = await h.api('PATCH', `/api/pricing/packs/${created.body.pack.packId}`, { price: 1100, isActive: false });

        assert.equal(res.status, 200);
        assert.equal(res.body.pack.price, 1100);
        assert.equal(res.body.pack.kmIncluded, 400);
        assert.equal(res.body.pack.isActive, false);
    });
});

describe('Pricing access', () => {
    it('lets staff read prices but not change them', async () => {
        const asStaff = { Cookie: await h.signIn(await h.createUser({ email: 'staff@test.local' })) };

        const read = await h.api('GET', '/api/pricing', undefined, asStaff);
        const rate = await h.api('POST', '/api/pricing/postpaid-rates', { rentalPerDay: 65, energyPerKm: 2, effectiveFrom: '2027-01-01' }, asStaff);
        const pack = await h.api('POST', '/api/pricing/packs', { kind: 'Weekly', name: 'X', price: 1, kmIncluded: 1 }, asStaff);

        assert.equal(read.status, 200);
        assert.equal(rate.status, 403);
        assert.equal(pack.status, 403);
    });
});
