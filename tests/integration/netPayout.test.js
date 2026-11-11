const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

const WEEK = '2026-10-12'; // Monday, long ended
const BLINKIT_HEADER = 'Partner ID,Rider Name,Order Date,Total Earnings';

let blinkitId;

async function getBlinkitId() {
    if (!blinkitId) {
        const { body } = await h.api('GET', '/api/partners');
        blinkitId = body.partners.find(partner => partner.name === 'Blinkit').partnerId;
    }

    return blinkitId;
}

async function upload(lines) {
    const form = new FormData();
    form.append('type', 'partner_earnings');
    form.append('partnerId', String(await getBlinkitId()));
    form.append('file', new Blob([[BLINKIT_HEADER, ...lines].join('\n')], { type: 'text/csv' }), 'earnings.csv');

    const res = await h.api('POST', '/api/imports', form);
    assert.equal(res.status, 201);
}

async function map(riderId, partnerRiderId) {
    const res = await h.api('PUT', `/api/partner-mappings/riders/${riderId}`, {
        mappings: [{ partnerId: await getBlinkitId(), partnerRiderId }]
    });
    assert.equal(res.status, 200);
}

async function bills() {
    const { body } = await h.api('GET', `/api/billing/bills?weekStart=${WEEK}`);
    return body;
}

function weekPayout() {
    return h.api('GET', `/api/payouts/weeks/${WEEK}`);
}

function triggerPayout() {
    return h.api('POST', `/api/payouts/weeks/${WEEK}/run`);
}

// PRIYA holds a bike all week (₹413 rental) and earns ₹300: net −₹113.
// MEERA has no bike and earns ₹1,200: net +₹1,200.
async function seedWeek() {
    await h.createRider('PRIYA');
    await h.createRider('MEERA');
    const bikeId = await h.createBike('VIN-1');
    await h.createAssignment(bikeId, 'PRIYA', '2026-10-01 09:00');

    await map('PRIYA', 'BLK-1');
    await map('MEERA', 'BLK-2');
    await upload([
        'BLK-1,Priya,13-10-2026,300',
        'BLK-2,Meera,13-10-2026,700',
        'BLK-2,Meera,18-10-2026,500'
    ]);
}

describe('Net payout on bills', () => {
    it('net is earnings minus deductions, and may be negative', async () => {
        await seedWeek();

        const list = await bills();
        const priya = list.riders.find(rider => rider.riderId === 'PRIYA');
        const meera = list.riders.find(rider => rider.riderId === 'MEERA');

        assert.equal(priya.totalAmount, 413);
        assert.equal(priya.earnings, 300);
        assert.equal(priya.netPayout, -113);

        assert.equal(meera.totalAmount, 0);
        assert.equal(meera.earnings, 1200);
        assert.equal(meera.netPayout, 1200);

        assert.equal(list.totalAmount, 413);
        assert.equal(list.totalEarnings, 1500);
        assert.equal(list.totalNetPayout, 1087);
    });

    it('the rider bill shows earnings and net', async () => {
        await seedWeek();

        const { bill } = (await h.api('GET', `/api/billing/riders/MEERA?weekStart=${WEEK}`)).body;

        assert.equal(bill.totalAmount, 0);
        assert.equal(bill.earnings, 1200);
        assert.equal(bill.netPayout, 1200);
    });

    it('earnings outside the week or not matched are left out', async () => {
        await seedWeek();
        await upload(['BLK-1,Priya,19-10-2026,999', 'BLK-404,Unknown,14-10-2026,50']);

        const priya = (await bills()).riders.find(rider => rider.riderId === 'PRIYA');

        assert.equal(priya.earnings, 300);
    });

    it('a rider with only earnings is not changed since close', async () => {
        await seedWeek();

        const close = await h.api('POST', `/api/billing/weeks/${WEEK}/close`);

        assert.equal(close.status, 201);
        // Only PRIYA has a bill to save; MEERA only has earnings.
        assert.equal(close.body.closure.riderCount, 1);

        // Earnings arriving after close do not change the deductions billed.
        await upload(['BLK-2,Meera,14-10-2026,100']);

        const list = await bills();

        assert.equal(list.viewCounts.changed, 0);
        assert.equal(list.riders.find(rider => rider.riderId === 'MEERA').earnings, 1300);
    });
});

describe('Payout with earnings', () => {
    it('is blocked while the week has pending earnings', async () => {
        await seedWeek();
        await upload(['BLK-404,Unknown,14-10-2026,50']);

        const { payout } = (await weekPayout()).body;

        assert.equal(payout.pendingEarningsCount, 1);
        assert.equal(payout.blocker, 'Cannot trigger the payout: 1 partner ID(s) have pending earnings this week');

        const res = await triggerPayout();

        assert.equal(res.status, 409);
        assert.match(res.body.error, /pending earnings/);
    });

    it('pays riders with only earnings and stores earnings and net', async () => {
        await seedWeek();

        const res = await triggerPayout();

        assert.equal(res.status, 201);
        assert.equal(res.body.run.riderCount, 2);
        assert.equal(res.body.run.totalAmount, 413);
        assert.equal(res.body.run.totalEarnings, 1500);
        assert.equal(res.body.run.totalNetPayout, 1087);

        const priya = (await bills()).riders.find(rider => rider.riderId === 'PRIYA');

        assert.equal(priya.payout.earnings, 300);
        assert.equal(priya.payout.netPayout, -113);
    });

    it('a late earnings correction shows up for a payout re-run', async () => {
        await seedWeek();
        assert.equal((await triggerPayout()).status, 201);

        await upload(['BLK-1,Priya,13-10-2026,450']);

        const { payout } = (await weekPayout()).body;

        assert.equal(payout.changeCount, 1);
        assert.equal(payout.changes[0].riderId, 'PRIYA');
        assert.equal(payout.changes[0].paid.earnings, 300);
        assert.equal(payout.changes[0].current.earnings, 450);
        assert.equal(payout.changes[0].current.netPayout, 37);
        // Only earnings changed: deductions are the same, net payout is up by ₹150.
        assert.equal(payout.changes[0].difference, 0);
        assert.equal(payout.changes[0].netDifference, 150);
        assert.equal(payout.changeNetDifference, 150);
        assert.equal((await bills()).riders.find(rider => rider.riderId === 'PRIYA').payoutNetDifference, 150);

        const rerun = await triggerPayout();

        assert.equal(rerun.status, 201);
        assert.equal(rerun.body.run.totalNetPayout, 1237);
    });

    it('old payouts without earnings show no changes', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');
        assert.equal((await triggerPayout()).status, 201);

        // As saved before partner earnings existed.
        await h.pool.query('UPDATE payout_items SET total_earnings = NULL, net_payout = NULL');
        await h.pool.query('UPDATE payout_runs SET total_earnings = NULL, total_net_payout = NULL');

        const { payout } = (await weekPayout()).body;
        const list = await bills();

        assert.equal(payout.changeCount, 0);
        assert.equal(payout.paidNetPayout, null);
        assert.equal(list.payout.pendingCount, 0);
        assert.equal(list.riders[0].payout.earnings, null);

        // Earnings arriving later: the old payout's net counts as 0 − ₹413.
        await map('YS-001', 'BLK-1');
        await upload(['BLK-1,Rider,13-10-2026,100']);

        const change = (await weekPayout()).body.payout.changes[0];

        assert.equal(change.difference, 0);
        assert.equal(change.netDifference, 100);
    });
});
