const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const billingService = require('../../services/billingService');
const payoutRepository = require('../../repositories/payoutRepository');

// Gaps found in the partner earnings review. Each test states the behaviour we want,
// so it fails today and passes once the gap is fixed.

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

const WEEK = '2026-10-12'; // Monday, long ended
const NEXT_WEEK = '2026-10-19';
const WEEK_AFTER = '2026-10-26';
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

    return res.body.import;
}

async function saveMappings(riderId, mappings) {
    const res = await h.api('PUT', `/api/partner-mappings/riders/${riderId}`, { mappings });
    assert.equal(res.status, 200);
}

async function map(riderId, partnerRiderId) {
    await saveMappings(riderId, [{ partnerId: await getBlinkitId(), partnerRiderId }]);
}

async function earning(partnerRiderId, earningDate) {
    const { rows: [row] } = await h.pool.query(
        `SELECT status, rider_id, amount::float8 AS amount
         FROM partner_earnings
         WHERE partner_rider_id = $1 AND earning_date = $2`,
        [partnerRiderId, earningDate]
    );

    return row ?? null;
}

function triggerPayout(weekStart = WEEK) {
    return h.api('POST', `/api/payouts/weeks/${weekStart}/run`);
}

// PRIYA holds a bike all week (₹413 rental) and earns ₹300 on Blinkit: net −₹113.
async function seedPriya() {
    await h.createRider('PRIYA');
    const bikeId = await h.createBike('VIN-1');
    await h.createAssignment(bikeId, 'PRIYA', '2026-10-01 09:00');

    await map('PRIYA', 'BLK-1');
    await upload(['BLK-1,Priya,13-10-2026,300']);
}

describe('Gap 1: mappings have no dates', () => {
    // AMIT held BLK-1 from 1 to 19 Oct; it was given to RAVI on 20 Oct.
    async function reassignBlk1() {
        await h.createRider('AMIT');
        await h.createRider('RAVI');

        await map('AMIT', 'BLK-1');
        await upload(['BLK-1,Amit,13-10-2026,300']);

        await saveMappings('AMIT', []);
        await map('RAVI', 'BLK-1');

        await h.pool.query(
            `UPDATE rider_partner_mappings SET created_at = '2026-10-01', deactivated_at = '2026-10-20'
             WHERE rider_id = 'AMIT'`
        );
        await h.pool.query(
            `UPDATE rider_partner_mappings SET created_at = '2026-10-20'
             WHERE rider_id = 'RAVI'`
        );
    }

    it('a late row dated before the ID moved goes to the rider who held it on that date', async () => {
        await reassignBlk1();

        // Blinkit sends 15 Oct late, after BLK-1 already belongs to RAVI.
        await upload(['BLK-1,Amit,15-10-2026,250']);

        assert.equal((await earning('BLK-1', '2026-10-13')).rider_id, 'AMIT');
        assert.equal((await earning('BLK-1', '2026-10-15')).rider_id, 'AMIT');
    });

    it('a row dated after the ID moved goes to the new rider', async () => {
        await reassignBlk1();

        await upload(['BLK-1,Ravi,21-10-2026,400']);

        assert.equal((await earning('BLK-1', '2026-10-21')).rider_id, 'RAVI');
    });

    it('a mapping fixed on the day it was made covers nothing, so the fixed one covers earlier dates', async () => {
        await h.createRider('AMIT');
        await h.createRider('RAVI');

        // BLK-1 is mapped to the wrong rider and corrected the same day.
        await map('AMIT', 'BLK-1');
        await saveMappings('AMIT', []);
        await map('RAVI', 'BLK-1');

        await upload(['BLK-1,Ravi,13-10-2026,300']);

        assert.equal((await earning('BLK-1', '2026-10-13')).rider_id, 'RAVI');
    });

    it('rows from while the ID was unmapped stay pending until a reviewer resolves them', async () => {
        await h.createRider('AMIT');
        await h.createRider('RAVI');

        // AMIT held BLK-1 from 1 to 9 Oct; nobody held it after that.
        await map('AMIT', 'BLK-1');
        await saveMappings('AMIT', []);
        await h.pool.query(
            `UPDATE rider_partner_mappings SET created_at = '2026-10-01', deactivated_at = '2026-10-10'
             WHERE rider_id = 'AMIT'`
        );

        await upload(['BLK-1,Unknown,15-10-2026,300']);
        assert.equal((await earning('BLK-1', '2026-10-15')).status, 'Pending');

        // Mapping BLK-1 to RAVI today does not reach back to 15 Oct.
        await map('RAVI', 'BLK-1');
        assert.equal((await earning('BLK-1', '2026-10-15')).status, 'Pending');

        // A reviewer who sees the row and picks RAVI does.
        const res = await h.api('POST', '/api/partner-earnings/pending/resolve', {
            partnerId: await getBlinkitId(),
            partnerRiderId: 'BLK-1',
            riderId: 'RAVI'
        });

        assert.equal(res.status, 200);
        assert.equal(res.body.matchedEarnings, 1);
        assert.equal((await earning('BLK-1', '2026-10-15')).rider_id, 'RAVI');
    });
});

describe('Gap 2: rejected earnings rows do not block the payout', () => {
    it('a row that failed to import blocks the payout of its week', async () => {
        await seedPriya();

        const batch = await upload(['BLK-1,Priya,14-10-2026,12O']); // letter O typed for a zero
        assert.equal(batch.status, 'Failed');

        const { payout } = (await h.api('GET', `/api/payouts/weeks/${WEEK}`)).body;
        assert.notEqual(payout.blocker, null);

        assert.equal((await triggerPayout()).status, 409);
    });

    it('a negative amount (a partner penalty) is not dropped from the net', async () => {
        await seedPriya();

        // Blinkit takes ₹150 back on 14 Oct.
        await upload(['BLK-1,Priya,14-10-2026,-150']);

        const res = await triggerPayout();

        // Either the penalty counts (₹300 − ₹150 = ₹150 earnings), or the payout waits until it is dealt with.
        if (res.status === 201) {
            const { body } = await h.api('GET', `/api/billing/bills?weekStart=${WEEK}`);
            const priya = body.riders.find(rider => rider.riderId === 'PRIYA');

            assert.equal(priya.payout.earnings, 150);
        } else {
            assert.equal(res.status, 409);
        }
    });
});

describe('Gap 3: a negative balance is lost when a week is skipped', () => {
    it('a week cannot be paid before the week before it, while that week has bills', async () => {
        await seedPriya();
        assert.equal((await triggerPayout(WEEK)).status, 201);

        // NEXT_WEEK is left unpaid: PRIYA's −₹113 and that week's rental are still owed.
        const res = await triggerPayout(WEEK_AFTER);

        assert.equal(res.status, 409);
        assert.match(res.body.error, new RegExp(NEXT_WEEK));

        const { payout } = (await h.api('GET', `/api/payouts/weeks/${WEEK_AFTER}`)).body;
        assert.equal(payout.unpaidPreviousWeek, NEXT_WEEK);
        assert.equal(payout.blocker, `Cannot trigger the payout: pay the week of ${NEXT_WEEK} first`);

        // Paid in order, both go through.
        assert.equal((await triggerPayout(NEXT_WEEK)).status, 201);
        assert.equal((await triggerPayout(WEEK_AFTER)).status, 201);
    });

    it('a previous week with nothing to pay does not block', async () => {
        await seedPriya();
        assert.equal((await triggerPayout(WEEK)).status, 201);

        // PRIYA returns her bike before NEXT_WEEK and nets ₹0 that week; MEERA earns in WEEK_AFTER only.
        await h.pool.query(`UPDATE bike_assignments SET returned_at = '2026-10-18 20:00'`);
        await h.pool.query(`UPDATE payout_items SET net_payout = 0`);
        await h.createRider('MEERA');
        await map('MEERA', 'BLK-2');
        await upload(['BLK-2,Meera,27-10-2026,500']);

        assert.equal((await h.api('GET', `/api/payouts/weeks/${WEEK_AFTER}`)).body.payout.unpaidPreviousWeek, null);
        assert.equal((await triggerPayout(WEEK_AFTER)).status, 201);
    });
});

describe('Gap 4: the payout checks bills read before taking its lock', () => {
    it('earnings imported while a payout starts are never paid around', async () => {
        await seedPriya();

        // Make an unknown ID's earnings arrive right after the payout has read the week's bills.
        // A fix that takes the lock first makes this import wait for the payout, so it is not awaited
        // for longer than half a second.
        const original = billingService.calculateWeeklyBills;
        let imported = null;

        billingService.calculateWeeklyBills = async function (...args) {
            const summary = await original.apply(this, args);

            if (!imported) {
                imported = upload(['BLK-404,Unknown,14-10-2026,50']);
                await Promise.race([imported, new Promise(resolve => setTimeout(resolve, 500))]);
            }

            return summary;
        };

        let res;

        try {
            res = await triggerPayout();
        } finally {
            billingService.calculateWeeklyBills = original;
        }

        await imported;

        // A payout is fine only if the pending row arrived after it started.
        if (res.status === 201) {
            const { rows: [row] } = await h.pool.query(
                `SELECT COUNT(*)::int AS n
                 FROM partner_earnings pe
                 JOIN payout_runs pr ON pr.week_start = $1 AND pr.run_number = 1
                 WHERE pe.status = 'Pending' AND pe.created_at < pr.triggered_at`,
                [WEEK]
            );

            assert.equal(row.n, 0, 'the payout ran while the week had pending earnings');
        } else {
            assert.equal(res.status, 409);
            assert.match(res.body.error, /pending earnings/);
        }
    });

    // Holds WEEK's payout lock the way a running payout does, until release() is called.
    async function holdPayoutLock() {
        const client = await h.pool.connect();
        await client.query('BEGIN');
        await payoutRepository.lockWeek(client, { weekStart: WEEK });

        return async () => {
            await client.query('COMMIT');
            client.release();
        };
    }

    // Whether the promise is still unsettled after a short wait.
    async function isWaiting(promise) {
        const waiting = Symbol('waiting');
        const result = await Promise.race([
            promise.then(() => null, () => null),
            new Promise(resolve => setTimeout(() => resolve(waiting), 300))
        ]);

        return result === waiting;
    }

    it('an import for a week waits while that week is being paid; other weeks do not', async () => {
        await seedPriya();
        const release = await holdPayoutLock();

        // One partner's imports run one at a time, so the other week's file goes first.
        const otherWeek = upload(['BLK-1,Priya,20-10-2026,200']);
        let sameWeek;

        try {
            assert.equal(await isWaiting(otherWeek), false);

            sameWeek = upload(['BLK-1,Priya,14-10-2026,200']);
            assert.equal(await isWaiting(sameWeek), true);
        } finally {
            await release();
        }

        await sameWeek;
        assert.equal((await earning('BLK-1', '2026-10-14')).amount, 200);
    });

    it('resolving pending earnings of a week waits while that week is being paid', async () => {
        await seedPriya();
        await h.createRider('RAVI');
        await upload(['BLK-404,Ravi,14-10-2026,50']);
        const release = await holdPayoutLock();

        const resolving = h.api('POST', '/api/partner-earnings/pending/resolve', {
            partnerId: await getBlinkitId(),
            partnerRiderId: 'BLK-404',
            riderId: 'RAVI'
        });

        try {
            assert.equal(await isWaiting(resolving), true);
        } finally {
            await release();
        }

        assert.equal((await resolving).status, 200);
    });
});
