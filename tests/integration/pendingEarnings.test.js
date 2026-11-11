const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

const BLINKIT_HEADER = 'Partner ID,Rider Name,Order Date,Total Earnings';
const ZEPTO_HEADER = 'Zepto Rider ID,Week Start,Week End,Net Payable';

let partnerIdByName;

async function partnerId(name) {
    if (!partnerIdByName) {
        const { body } = await h.api('GET', '/api/partners');
        partnerIdByName = new Map(body.partners.map(partner => [partner.name, partner.partnerId]));
    }

    return partnerIdByName.get(name);
}

async function upload(partner, lines) {
    const form = new FormData();
    form.append('type', 'partner_earnings');
    form.append('partnerId', String(await partnerId(partner)));
    form.append('file', new Blob([lines.join('\n')], { type: 'text/csv' }), 'earnings.csv');

    const res = await h.api('POST', '/api/imports', form);
    assert.equal(res.status, 201);
}

async function map(riderId, partner, partnerRiderId) {
    return h.api('PUT', `/api/partner-mappings/riders/${riderId}`, {
        mappings: [{ partnerId: await partnerId(partner), partnerRiderId }]
    });
}

async function resolve(partner, partnerRiderId, riderId) {
    return h.api('POST', '/api/partner-earnings/pending/resolve', {
        partnerId: await partnerId(partner),
        partnerRiderId,
        riderId
    });
}

async function dismiss(partner, partnerRiderId, reason) {
    return h.api('POST', '/api/partner-earnings/pending/dismiss', {
        partnerId: await partnerId(partner),
        partnerRiderId,
        reason
    });
}

function listPending(query = '') {
    return h.api('GET', `/api/partner-earnings/pending${query}`);
}

async function earningsOf(partnerRiderId) {
    const result = await h.pool.query(
        `SELECT TO_CHAR(earning_date, 'YYYY-MM-DD') AS earning_date, status, rider_id, dismiss_reason
         FROM partner_earnings
         WHERE partner_rider_id = $1
         ORDER BY earning_date`,
        [partnerRiderId]
    );

    return result.rows;
}

async function activeMappings() {
    const result = await h.pool.query(
        `SELECT rider_id, partner_rider_id
         FROM rider_partner_mappings
         WHERE is_active
         ORDER BY rider_id, partner_rider_id`
    );

    return result.rows;
}

// BLK-9001 has two pending days, BLK-9002 one; ZPT-9003 has one pending week.
async function seedPending() {
    await upload('Blinkit', [
        BLINKIT_HEADER,
        'BLK-9001,Old Name,26-10-2026,400',
        'BLK-9001,Rahul Desai,27-10-2026,450.50',
        'BLK-9002,Neha Singh,28-10-2026,300'
    ]);
    await upload('Zepto', [ZEPTO_HEADER, 'ZPT-9003,2026-10-19,2026-10-25,1000']);
}

describe('GET /api/partner-earnings/pending', () => {
    beforeEach(seedPending);

    it('groups pending earnings by partner and ID, oldest first', async () => {
        const res = await listPending();

        assert.equal(res.status, 200);
        assert.equal(res.body.pagination.totalRecords, 3);
        assert.deepEqual(res.body.groups, [
            {
                partnerId: await partnerId('Zepto'),
                partnerName: 'Zepto',
                partnerRiderId: 'ZPT-9003',
                nameInFile: null,
                entries: 1,
                totalAmount: 1000,
                firstDate: '2026-10-19',
                lastDate: '2026-10-19'
            },
            {
                partnerId: await partnerId('Blinkit'),
                partnerName: 'Blinkit',
                partnerRiderId: 'BLK-9001',
                nameInFile: 'Rahul Desai',
                entries: 2,
                totalAmount: 850.5,
                firstDate: '2026-10-26',
                lastDate: '2026-10-27'
            },
            {
                partnerId: await partnerId('Blinkit'),
                partnerName: 'Blinkit',
                partnerRiderId: 'BLK-9002',
                nameInFile: 'Neha Singh',
                entries: 1,
                totalAmount: 300,
                firstDate: '2026-10-28',
                lastDate: '2026-10-28'
            }
        ]);
    });

    it('filters by partner and searches the ID or any name in the sheet', async () => {
        const byPartner = await listPending(`?partnerId=${await partnerId('Zepto')}`);
        const byOldName = await listPending('?search=old%20name');
        const byId = await listPending('?search=9002');

        assert.deepEqual(byPartner.body.groups.map(group => group.partnerRiderId), ['ZPT-9003']);
        // A match on one row still shows the whole group.
        assert.deepEqual(byOldName.body.groups.map(group => [group.partnerRiderId, group.entries]), [['BLK-9001', 2]]);
        assert.deepEqual(byId.body.groups.map(group => group.partnerRiderId), ['BLK-9002']);
    });

    it('pages through groups and rejects bad filters', async () => {
        const res = await listPending('?page=2&limit=2');

        assert.equal(res.body.count, 1);
        assert.equal(res.body.pagination.totalPages, 2);
        assert.equal((await listPending('?partnerId=abc')).status, 400);
        assert.equal((await listPending('?limit=101')).status, 400);
    });

    it('is open to staff as well as admins', async () => {
        const staffId = await h.createUser({ email: 'staff@example.com' });
        const res = await h.api('GET', '/api/partner-earnings/pending', undefined, { Cookie: await h.signIn(staffId) });

        assert.equal(res.status, 200);
    });
});

describe('POST /api/partner-earnings/pending/resolve', () => {
    beforeEach(async () => {
        await seedPending();
        await h.createRider('R-1');
        await h.createRider('R-2');
    });

    it('maps the ID and matches all its pending earnings at once', async () => {
        const res = await resolve('Blinkit', ' blk-9001 ', 'R-1');

        assert.equal(res.status, 200);
        assert.deepEqual(res.body, {
            message: 'Earnings matched',
            riderId: 'R-1',
            riderName: 'Rider R-1',
            partnerName: 'Blinkit',
            partnerRiderId: 'BLK-9001',
            matchedEarnings: 2
        });
        assert.deepEqual((await earningsOf('BLK-9001')).map(row => [row.status, row.rider_id]), [
            ['Matched', 'R-1'],
            ['Matched', 'R-1']
        ]);
        assert.deepEqual(await activeMappings(), [{ rider_id: 'R-1', partner_rider_id: 'BLK-9001' }]);
        assert.equal((await listPending()).body.pagination.totalRecords, 2);
    });

    it('later files for a resolved ID are matched on import', async () => {
        await resolve('Blinkit', 'BLK-9001', 'R-1');
        await upload('Blinkit', [BLINKIT_HEADER, 'BLK-9001,Rahul Desai,28-10-2026,500']);

        assert.deepEqual((await earningsOf('BLK-9001')).map(row => row.rider_id), ['R-1', 'R-1', 'R-1']);
    });

    it('refuses a rider who already has a different ID on that partner', async () => {
        await map('R-1', 'Blinkit', 'BLK-1001');

        const res = await resolve('Blinkit', 'BLK-9001', 'R-1');

        assert.equal(res.status, 409);
        assert.equal(res.body.error, 'Rider R-1 already has Blinkit ID BLK-1001. Change it on Partner Mappings first.');
        assert.deepEqual((await earningsOf('BLK-9001')).map(row => row.status), ['Pending', 'Pending']);
    });

    it('refuses an ID that is already mapped to another rider', async () => {
        // Written straight to the table: a normal mapping save would have matched the rows already.
        await h.pool.query(
            `INSERT INTO rider_partner_mappings (rider_id, partner_id, partner_rider_id)
             VALUES ('R-2', $1, 'BLK-9001')`,
            [await partnerId('Blinkit')]
        );

        const res = await resolve('Blinkit', 'BLK-9001', 'R-1');

        assert.equal(res.status, 409);
        assert.equal(res.body.error, 'Blinkit ID BLK-9001 is already mapped to Rider R-2 (R-2)');
    });

    it('checks the request', async () => {
        assert.equal((await resolve('Blinkit', 'BLK-9001', '')).status, 400);
        assert.equal((await resolve('Blinkit', '', 'R-1')).status, 400);
        assert.equal((await resolve('Blinkit', 'BLK-9001', 'R-404')).status, 404);

        const nothingPending = await resolve('Blinkit', 'BLK-0000', 'R-1');
        assert.equal(nothingPending.status, 404);
        assert.equal(nothingPending.body.error, 'No pending Blinkit earnings for BLK-0000');
        assert.deepEqual(await activeMappings(), []);

        const badPartner = await h.api('POST', '/api/partner-earnings/pending/resolve', {
            partnerId: 999, partnerRiderId: 'BLK-9001', riderId: 'R-1'
        });
        assert.equal(badPartner.status, 404);
    });

    it('two people resolving the same ID at once: only one wins', async () => {
        const results = await Promise.all([
            resolve('Blinkit', 'BLK-9001', 'R-1'),
            resolve('Blinkit', 'BLK-9001', 'R-2')
        ]);

        assert.deepEqual(results.map(res => res.status).sort(), [200, 404]);

        const winner = results.find(res => res.status === 200).body.riderId;
        assert.deepEqual(await activeMappings(), [{ rider_id: winner, partner_rider_id: 'BLK-9001' }]);
        assert.deepEqual((await earningsOf('BLK-9001')).map(row => row.rider_id), [winner, winner]);
    });
});

describe('POST /api/partner-earnings/pending/dismiss', () => {
    beforeEach(seedPending);

    it('sets all pending earnings of the ID aside with the reason', async () => {
        const res = await dismiss('Blinkit', 'BLK-9001', '  Rider works for another fleet ');

        assert.equal(res.status, 200);
        assert.equal(res.body.dismissedEarnings, 2);
        assert.deepEqual((await earningsOf('BLK-9001')).map(row => [row.status, row.dismiss_reason]), [
            ['Dismissed', 'Rider works for another fleet'],
            ['Dismissed', 'Rider works for another fleet']
        ]);
        assert.equal((await listPending()).body.pagination.totalRecords, 2);
    });

    it('needs a reason and pending earnings', async () => {
        assert.equal((await dismiss('Blinkit', 'BLK-9001', '  ')).status, 400);
        assert.equal((await dismiss('Blinkit', 'BLK-9001', 'x'.repeat(501))).status, 400);
        assert.equal((await dismiss('Blinkit', 'BLK-0000', 'Not ours')).status, 404);
    });

    it('a dismissed ID mapped later keeps its dismissed rows', async () => {
        await dismiss('Blinkit', 'BLK-9001', 'Not ours');
        await h.createRider('R-1');

        const res = await map('R-1', 'Blinkit', 'BLK-9001');

        assert.equal(res.body.matchedEarnings, 0);
        assert.deepEqual((await earningsOf('BLK-9001')).map(row => row.status), ['Dismissed', 'Dismissed']);
    });
});

describe('Mapping an ID that has pending earnings', () => {
    beforeEach(seedPending);

    it('Partner Mappings save matches its pending earnings too', async () => {
        await h.createRider('R-1');

        const res = await map('R-1', 'Blinkit', 'blk-9002');

        assert.equal(res.status, 200);
        assert.equal(res.body.matchedEarnings, 1);
        assert.deepEqual(await earningsOf('BLK-9002'), [
            { earning_date: '2026-10-28', status: 'Matched', rider_id: 'R-1', dismiss_reason: null }
        ]);
    });

    it('the dashboard counts IDs with pending earnings in the week', async () => {
        const week = await h.api('GET', '/api/dashboard?weekStart=2026-10-26');
        const earlierWeek = await h.api('GET', '/api/dashboard?weekStart=2026-10-19');

        assert.equal(week.body.dashboard.attention.pendingEarnings, 2);
        assert.equal(earlierWeek.body.dashboard.attention.pendingEarnings, 1);
    });
});
