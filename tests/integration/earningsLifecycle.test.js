// Partner earnings from file to payout, only through the API:
// import → pending → resolve → payout → corrected file → re-run.
const h = require('../helpers');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

before(async () => {
    await h.startServer();
    await h.resetDb();
});
after(h.stopServer);

const WEEK = '2026-10-12'; // Mon 12 – Sun 18 Oct
const BLINKIT_HEADER = 'Partner ID,Rider Name,Order Date,Total Earnings';

let blinkitId;

async function upload(lines) {
    const form = new FormData();
    form.append('type', 'partner_earnings');
    form.append('partnerId', String(blinkitId));
    form.append('file', new Blob([[BLINKIT_HEADER, ...lines].join('\n')], { type: 'text/csv' }), 'blinkit.csv');

    const res = await h.api('POST', '/api/imports', form);
    assert.equal(res.status, 201);
    return res.body.import;
}

async function billOf(riderId) {
    const res = await h.api('GET', `/api/billing/bills?weekStart=${WEEK}&limit=100`);
    return res.body.riders.find(rider => rider.riderId === riderId);
}

async function weekPayout() {
    return (await h.api('GET', `/api/payouts/weeks/${WEEK}`)).body.payout;
}

function triggerPayout() {
    return h.api('POST', `/api/payouts/weeks/${WEEK}/run`);
}

describe('Partner earnings through a payout', () => {
    it('reaches the right net payout at every step', async () => {
        // ---- Riders ----
        // R-1 holds a bike all week (₹413 rental) and is mapped to BLK-1001.
        // R-2 has no bike; their Blinkit ID is not mapped yet.
        await h.createRider('R-1');
        await h.createRider('R-2');
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'R-1', '2026-10-01 09:00');

        blinkitId = (await h.api('GET', '/api/partners')).body.partners
            .find(partner => partner.name === 'Blinkit').partnerId;

        const mapped = await h.api('PUT', '/api/partner-mappings/riders/R-1', {
            mappings: [{ partnerId: blinkitId, partnerRiderId: 'BLK-1001' }]
        });
        assert.equal(mapped.status, 200);

        // ---- Import: a known ID is matched, an unknown one waits for review ----
        const first = await upload([
            'BLK-1001,Rider One,13-10-2026,500',
            'BLK-2002,Rider Two,14-10-2026,300'
        ]);

        assert.deepEqual(first.resultSummary, { matched: 1, pending: 1, updated: 0, unchanged: 0 });

        // ---- Pending earnings block the payout ----
        assert.equal((await weekPayout()).pendingEarningsCount, 1);

        const blocked = await triggerPayout();
        assert.equal(blocked.status, 409);
        assert.match(blocked.body.error, /1 partner ID\(s\) have pending earnings/);

        // ---- Resolve: maps the ID and matches its rows ----
        const resolved = await h.api('POST', '/api/partner-earnings/pending/resolve', {
            partnerId: blinkitId,
            partnerRiderId: 'BLK-2002',
            riderId: 'R-2'
        });

        assert.equal(resolved.status, 200);
        assert.equal(resolved.body.matchedEarnings, 1);
        assert.equal((await weekPayout()).pendingEarningsCount, 0);

        const r1 = await billOf('R-1');
        const r2 = await billOf('R-2');

        assert.deepEqual([r1.totalAmount, r1.earnings, r1.netPayout], [413, 500, 87]);
        assert.deepEqual([r2.totalAmount, r2.earnings, r2.netPayout], [0, 300, 300]);

        // ---- First payout ----
        const run1 = await triggerPayout();

        assert.equal(run1.status, 201);
        assert.equal(run1.body.run.riderCount, 2);
        assert.equal(run1.body.run.totalAmount, 413);
        assert.equal(run1.body.run.totalEarnings, 800);
        assert.equal(run1.body.run.totalNetPayout, 387);

        // ---- Corrected file: R-1's amount drops, R-2 has a new day ----
        // R-2's ID is mapped now, so the new row is matched on import.
        const corrected = await upload([
            'BLK-1001,Rider One,13-10-2026,400',
            'BLK-2002,Rider Two,14-10-2026,300',
            'BLK-2002,Rider Two,15-10-2026,200'
        ]);

        assert.deepEqual(corrected.resultSummary, { matched: 1, pending: 0, updated: 1, unchanged: 1 });

        // R-1 now owes more than they earned.
        assert.equal((await billOf('R-1')).netPayout, -13);

        const payout = await weekPayout();

        assert.equal(payout.blocker, null);
        assert.deepEqual(
            payout.changes.map(change => [change.riderId, change.paid.earnings, change.current.earnings, change.current.netPayout]),
            [['R-1', 500, 400, -13], ['R-2', 300, 500, 500]]
        );

        // ---- Re-run applies only the changes ----
        const run2 = await triggerPayout();

        assert.equal(run2.status, 201);
        assert.equal(run2.body.run.runNumber, 2);
        assert.equal(run2.body.run.updatedCount, 2);
        assert.equal(run2.body.run.totalEarnings, 900);
        assert.equal(run2.body.run.totalNetPayout, 487);

        assert.equal((await triggerPayout()).status, 409);
        assert.equal((await billOf('R-1')).payout.netPayout, -13);
    });
});
