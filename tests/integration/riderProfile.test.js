const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

function addDays(date, days) {
    const result = new Date(`${date}T00:00:00.000Z`);
    result.setUTCDate(result.getUTCDate() + days);
    return result.toISOString().slice(0, 10);
}

// Monday of the current IST week.
function currentWeekStart() {
    const today = h.todayInIst();
    return addDays(today, -((new Date(`${today}T00:00:00.000Z`).getUTCDay() + 6) % 7));
}

// A payout for the rider in the given week with only a net, e.g. a negative net carried forward.
async function createPayoutItem(riderId, weekStart, netPayout) {
    const { rows: [run] } = await h.pool.query(
        `INSERT INTO payout_runs (week_start, run_number, rider_count, updated_count, total_amount)
         VALUES ($1, 1, 1, 1, 0)
         RETURNING run_id`,
        [weekStart]
    );

    await h.pool.query(
        `INSERT INTO payout_items
            (week_start, rider_id, rental_days, total_rental, total_km, total_energy_charge, total_amount,
             total_earnings, net_payout, first_run_id, updated_run_id)
         VALUES ($1, $2, 0, 0, 0, 0, 0, 0, $3, $4, $4)`,
        [weekStart, riderId, netPayout, run.run_id]
    );
}

describe('Rider profile', () => {
    it('returns the rider, current bike and this week\'s bill', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1', { registrationNumber: 'MH12AB1234' });
        await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');

        const res = await h.api('GET', '/api/riders/YS-001/profile');

        assert.equal(res.status, 200);
        assert.equal(res.body.rider.riderId, 'YS-001');
        assert.equal(res.body.currentAssignment.bikeId, String(bikeId));
        assert.equal(res.body.currentAssignment.registrationNumber, 'MH12AB1234');
        assert.deepEqual(res.body.partnerMappings, []);
        assert.equal(res.body.currentWeekBill.weekStart, currentWeekStart());
        assert.equal(res.body.outstandingBalance, 0);
    });

    it('has no current bike once the bike is returned', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00', '2026-10-05 18:00');

        const res = await h.api('GET', '/api/riders/YS-001/profile');

        assert.equal(res.body.currentAssignment, null);
    });

    it('shows last week\'s negative net as the outstanding balance', async () => {
        await h.createRider('YS-001');
        await createPayoutItem('YS-001', addDays(currentWeekStart(), -7), -250);

        const res = await h.api('GET', '/api/riders/YS-001/profile');

        assert.equal(res.body.currentWeekBill.previousBalance, -250);
        assert.equal(res.body.outstandingBalance, 250);
    });

    it('returns 404 for an unknown rider', async () => {
        const res = await h.api('GET', '/api/riders/NOPE/profile');

        assert.equal(res.status, 404);
    });
});

describe('Rider payouts and assignments', () => {
    it('lists paid weeks newest first', async () => {
        await h.createRider('YS-001');
        await createPayoutItem('YS-001', '2026-10-05', 100);
        await createPayoutItem('YS-001', '2026-10-12', -50);

        const res = await h.api('GET', '/api/riders/YS-001/payouts');

        assert.equal(res.status, 200);
        assert.equal(res.body.pagination.totalRecords, 2);
        assert.deepEqual(res.body.payouts.map(payout => payout.weekStart), ['2026-10-12', '2026-10-05']);
        assert.equal(res.body.payouts[0].netPayout, -50);
    });

    it('lists assignments newest first, one page at a time', async () => {
        await h.createRider('YS-001');
        const oldBike = await h.createBike('VIN-1');
        const newBike = await h.createBike('VIN-2');
        await h.createAssignment(oldBike, 'YS-001', '2026-10-01 09:00', '2026-10-05 18:00');
        await h.createAssignment(newBike, 'YS-001', '2026-10-06 09:00');

        const res = await h.api('GET', '/api/riders/YS-001/assignments?page=1&limit=1');

        assert.equal(res.status, 200);
        assert.equal(res.body.pagination.totalRecords, 2);
        assert.equal(res.body.pagination.totalPages, 2);
        assert.equal(res.body.assignments.length, 1);
        assert.equal(res.body.assignments[0].bikeId, String(newBike));
        assert.equal(res.body.assignments[0].returnedAt, null);
    });

    it('rejects a bad page with 400', async () => {
        await h.createRider('YS-001');

        const res = await h.api('GET', '/api/riders/YS-001/assignments?page=0');

        assert.equal(res.status, 400);
    });

    it('returns 404 for an unknown rider', async () => {
        const res = await h.api('GET', '/api/riders/NOPE/payouts');

        assert.equal(res.status, 404);
    });
});
