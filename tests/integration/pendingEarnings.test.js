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

describe('Who did it', () => {
    beforeEach(async () => {
        await seedPending();
        await h.createRider('R-1');
    });

    async function reviewers() {
        const result = await h.pool.query(
            `SELECT pe.partner_rider_id, pe.status, u.name AS reviewed_by, pe.reviewed_at IS NOT NULL AS has_time
             FROM partner_earnings pe
             LEFT JOIN users u ON u.user_id = pe.reviewed_by
             ORDER BY pe.partner_rider_id, pe.earning_date`
        );

        return result.rows.map(row => [row.partner_rider_id, row.status, row.reviewed_by, row.has_time]);
    }

    it('records who uploaded, resolved, dismissed and changed a mapping', async () => {
        const staffId = await h.createUser({ email: 'staff@example.com' });
        const admin = 'User admin@test.local';

        assert.equal((await resolve('Blinkit', 'BLK-9001', 'R-1')).status, 200);

        // Staff can dismiss too, and are recorded as themselves.
        const dismissed = await h.api('POST', '/api/partner-earnings/pending/dismiss', {
            partnerId: await partnerId('Blinkit'),
            partnerRiderId: 'BLK-9002',
            reason: 'Test rows'
        }, { Cookie: await h.signIn(staffId) });
        assert.equal(dismissed.status, 200);

        // A new ID ends the mapping the resolve made.
        assert.equal((await map('R-1', 'Blinkit', 'BLK-7777')).status, 200);

        assert.deepEqual(await reviewers(), [
            ['BLK-9001', 'Matched', admin, true],
            ['BLK-9001', 'Matched', admin, true],
            ['BLK-9002', 'Dismissed', 'User staff@example.com', true],
            ['ZPT-9003', 'Pending', null, false]
        ]);

        const { rows: mappings } = await h.pool.query(
            `SELECT m.partner_rider_id, c.name AS created_by, d.name AS deactivated_by
             FROM rider_partner_mappings m
             LEFT JOIN users c ON c.user_id = m.created_by
             LEFT JOIN users d ON d.user_id = m.deactivated_by
             ORDER BY m.mapping_id`
        );
        assert.deepEqual(mappings, [
            { partner_rider_id: 'BLK-9001', created_by: admin, deactivated_by: admin },
            { partner_rider_id: 'BLK-7777', created_by: admin, deactivated_by: null }
        ]);

        const { imports } = (await h.api('GET', '/api/imports')).body;
        assert.ok(imports.length > 0);
        assert.ok(imports.every(batch => batch.uploadedBy === admin));
    });

    it('a dismissed row that comes back with a new amount loses its reviewer', async () => {
        await dismiss('Blinkit', 'BLK-9002', 'Test rows');
        await upload('Blinkit', [BLINKIT_HEADER, 'BLK-9002,Neha Singh,28-10-2026,350']);

        assert.deepEqual(
            (await reviewers()).find(([id]) => id === 'BLK-9002'),
            ['BLK-9002', 'Pending', null, false]
        );
    });
});

describe('Moving earnings matched to the wrong rider', () => {
    // BLK-9001 (26 and 27 Oct) was resolved to R-1 by mistake, then the mapping was moved to R-2.
    beforeEach(async () => {
        await seedPending();
        await h.createRider('R-1');
        await h.createRider('R-2');
        await resolve('Blinkit', 'BLK-9001', 'R-1');
        await h.api('PUT', '/api/partner-mappings/riders/R-1', { mappings: [] });
        await map('R-2', 'Blinkit', 'BLK-9001');
    });

    async function moveRequest(overrides = {}) {
        return {
            partnerId: await partnerId('Blinkit'),
            partnerRiderId: 'BLK-9001',
            riderId: 'R-2',
            fromDate: '2026-10-26',
            toDate: '2026-10-27',
            ...overrides
        };
    }

    function move(body, headers) {
        return h.api('POST', '/api/partner-earnings/move', body, headers);
    }

    it('previews and moves the earnings to the rider who holds the ID now', async () => {
        const params = new URLSearchParams(await moveRequest());
        const preview = await h.api('GET', `/api/partner-earnings/move-preview?${params}`);

        assert.equal(preview.status, 200);
        assert.deepEqual(preview.body.riders, [{ riderId: 'R-1', riderName: 'Rider R-1', entries: 2, totalAmount: 850.5 }]);

        const res = await move(await moveRequest());

        assert.equal(res.status, 200);
        assert.equal(res.body.movedEarnings, 2);
        assert.deepEqual(res.body.fromRiders, preview.body.riders);
        assert.deepEqual((await earningsOf('BLK-9001')).map(row => [row.status, row.rider_id]), [
            ['Matched', 'R-2'],
            ['Matched', 'R-2']
        ]);

        const { rows } = await h.pool.query(`SELECT DISTINCT reviewed_by FROM partner_earnings WHERE partner_rider_id = 'BLK-9001'`);
        assert.equal(rows.length, 1);
        assert.notEqual(rows[0].reviewed_by, null);
    });

    it('moves only the rows inside the dates', async () => {
        const res = await move(await moveRequest({ fromDate: '2026-10-27' }));

        assert.equal(res.body.movedEarnings, 1);
        assert.deepEqual((await earningsOf('BLK-9001')).map(row => row.rider_id), ['R-1', 'R-2']);
    });

    it('needs the rider to hold the ID, something to move and valid dates', async () => {
        const notHeld = await move(await moveRequest({ riderId: 'R-1' }));
        assert.equal(notHeld.status, 409);
        assert.equal(notHeld.body.error, 'Map Blinkit ID BLK-9001 to Rider R-1 first');

        const nothing = await move(await moveRequest({ fromDate: '2026-11-01', toDate: '2026-11-30' }));
        assert.equal(nothing.status, 404);

        assert.equal((await move(await moveRequest({ fromDate: '2026-10-28' }))).status, 400);
        assert.equal((await move(await moveRequest({ toDate: '27-10-2026' }))).status, 400);
    });

    it('is for admins only', async () => {
        const staffId = await h.createUser({ email: 'staff@example.com' });
        const res = await move(await moveRequest(), { Cookie: await h.signIn(staffId) });

        assert.equal(res.status, 403);
        assert.equal((await earningsOf('BLK-9001'))[0].rider_id, 'R-1');
    });
});
