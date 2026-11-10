const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

let partnerIdByName;

async function partnerId(name) {
    if (!partnerIdByName) {
        const { body } = await h.api('GET', '/api/partners');
        partnerIdByName = new Map(body.partners.map(partner => [partner.name, partner.partnerId]));
    }

    return partnerIdByName.get(name);
}

async function saveMappings(riderId, mappings) {
    const body = {
        mappings: await Promise.all(mappings.map(async ([partner, partnerRiderId]) => ({
            partnerId: await partnerId(partner),
            partnerRiderId
        })))
    };

    return h.api('PUT', `/api/partner-mappings/riders/${riderId}`, body);
}

function listMappings(query = '') {
    return h.api('GET', `/api/partner-mappings${query}`);
}

async function mappingRows(riderId) {
    const result = await h.pool.query(
        `SELECT partner_rider_id, is_active, deactivated_at IS NOT NULL AS ended
         FROM rider_partner_mappings
         WHERE rider_id = $1
         ORDER BY mapping_id`,
        [riderId]
    );

    return result.rows;
}

describe('Partners', () => {
    it('lists the partners from the schema, by name', async () => {
        const res = await h.api('GET', '/api/partners');

        assert.equal(res.status, 200);
        assert.deepEqual(res.body.partners.map(partner => partner.name), [
            'BigBasket',
            'Blinkit',
            'Instamart',
            'Porter',
            'Zepto',
            'Zomato India Pvt Ltd'
        ]);
    });
});

describe('Saving partner mappings', () => {
    it('maps a rider to several partners and stores IDs trimmed and uppercase', async () => {
        await h.createRider('YS-001');

        const res = await saveMappings('YS-001', [['Blinkit', '  blk-1001 '], ['Zepto', 'ZPT-2001']]);

        assert.equal(res.status, 200);
        assert.equal(res.body.added, 2);
        assert.equal(res.body.removed, 0);
        assert.deepEqual(
            res.body.rider.mappings.map(mapping => [mapping.partnerName, mapping.partnerRiderId]),
            [['Blinkit', 'BLK-1001'], ['Zepto', 'ZPT-2001']]
        );
        assert.ok(res.body.rider.lastMappedAt);
    });

    it('rejects an ID that is already mapped to another rider, ignoring case', async () => {
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        await saveMappings('YS-001', [['Blinkit', 'BLK-1001']]);

        const res = await saveMappings('YS-002', [['Zepto', 'ZPT-1'], ['Blinkit', 'blk-1001']]);

        assert.equal(res.status, 409);
        assert.equal(res.body.error, 'Blinkit ID BLK-1001 is already mapped to Rider YS-001 (YS-001)');
        // Nothing is saved when one ID clashes.
        assert.deepEqual(await mappingRows('YS-002'), []);
    });

    it('allows the same ID on two different partners', async () => {
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        await saveMappings('YS-001', [['Blinkit', 'R-100']]);

        const res = await saveMappings('YS-002', [['Zepto', 'R-100']]);

        assert.equal(res.status, 200);
    });

    it('saving the same list again changes nothing', async () => {
        await h.createRider('YS-001');
        await saveMappings('YS-001', [['Blinkit', 'BLK-1001']]);

        const res = await saveMappings('YS-001', [['Blinkit', 'blk-1001']]);

        assert.equal(res.body.added, 0);
        assert.equal(res.body.removed, 0);
        assert.equal((await mappingRows('YS-001')).length, 1);
    });

    it('a changed ID ends the old mapping and keeps it as history', async () => {
        await h.createRider('YS-001');
        await saveMappings('YS-001', [['Blinkit', 'BLK-1001']]);

        const res = await saveMappings('YS-001', [['Blinkit', 'BLK-1002']]);

        assert.equal(res.body.added, 1);
        assert.equal(res.body.removed, 1);
        assert.deepEqual(await mappingRows('YS-001'), [
            { partner_rider_id: 'BLK-1001', is_active: false, ended: true },
            { partner_rider_id: 'BLK-1002', is_active: true, ended: false }
        ]);
    });

    it('a partner left out of the list is unmapped, and its ID can then go to another rider', async () => {
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        await saveMappings('YS-001', [['Blinkit', 'BLK-1001'], ['Zepto', 'ZPT-2001']]);

        const res = await saveMappings('YS-001', [['Zepto', 'ZPT-2001']]);

        assert.equal(res.body.removed, 1);
        assert.deepEqual(res.body.rider.mappings.map(mapping => mapping.partnerName), ['Zepto']);
        assert.equal((await saveMappings('YS-002', [['Blinkit', 'BLK-1001']])).status, 200);
    });

    it('an empty list unmaps the rider', async () => {
        await h.createRider('YS-001');
        await saveMappings('YS-001', [['Blinkit', 'BLK-1001']]);

        const res = await saveMappings('YS-001', []);

        assert.equal(res.status, 200);
        assert.deepEqual(res.body.rider.mappings, []);
        assert.equal(res.body.rider.lastMappedAt, null);
    });

    it('can map a terminated rider, whose late earnings are still owed', async () => {
        await h.createRider('YS-T', { status: 'Terminated', terminatedOn: '2026-10-01' });

        assert.equal((await saveMappings('YS-T', [['Blinkit', 'BLK-9']])).status, 200);
    });

    it('rejects bad input', async () => {
        await h.createRider('YS-001');
        const blinkit = await partnerId('Blinkit');
        const save = body => h.api('PUT', '/api/partner-mappings/riders/YS-001', body);

        assert.equal((await save({})).status, 400);
        assert.equal((await save({ mappings: [{ partnerId: 999, partnerRiderId: 'X' }] })).status, 400);
        assert.equal((await save({ mappings: [{ partnerId: blinkit, partnerRiderId: '   ' }] })).body.error,
            'Enter the Blinkit rider ID');
        assert.equal((await save({ mappings: [{ partnerId: blinkit, partnerRiderId: 1001 }] })).status, 400);
        assert.equal((await save({ mappings: [{ partnerId: blinkit, partnerRiderId: 'X'.repeat(101) }] })).status, 400);
        assert.equal((await save({
            mappings: [{ partnerId: blinkit, partnerRiderId: 'A' }, { partnerId: blinkit, partnerRiderId: 'B' }]
        })).body.error, 'Blinkit appears more than once');
        assert.equal((await saveMappings('NOPE', [['Blinkit', 'BLK-1']])).status, 404);
    });

    it('two riders saving the same ID at once: only one gets it', async () => {
        await h.createRider('YS-001');
        await h.createRider('YS-002');

        const results = await Promise.all([
            saveMappings('YS-001', [['Blinkit', 'BLK-1001']]),
            saveMappings('YS-002', [['Blinkit', 'BLK-1001']])
        ]);

        assert.deepEqual(results.map(res => res.status).sort(), [200, 409]);

        const active = await h.pool.query(
            `SELECT count(*)::int AS count FROM rider_partner_mappings WHERE is_active`
        );
        assert.equal(active.rows[0].count, 1);
    });
});

describe('Listing riders by mapping', () => {
    async function seedRiders() {
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        await h.createRider('YS-003', { status: 'Inactive' });
        await saveMappings('YS-001', [['Blinkit', 'BLK-1001']]);
    }

    it('splits riders into Without Mappings and Mapped, with a count for each tab', async () => {
        await seedRiders();

        const unmapped = await listMappings();
        const mapped = await listMappings('?view=mapped');

        assert.equal(unmapped.status, 200);
        assert.deepEqual(unmapped.body.counts, { unmapped: 2, mapped: 1 });
        assert.deepEqual(unmapped.body.riders.map(rider => rider.riderId).sort(), ['YS-002', 'YS-003']);
        assert.deepEqual(unmapped.body.riders[0].mappings, []);
        assert.equal(unmapped.body.pagination.totalRecords, 2);

        assert.deepEqual(mapped.body.riders.map(rider => rider.riderId), ['YS-001']);
        assert.equal(mapped.body.riders[0].mappings[0].partnerRiderId, 'BLK-1001');
    });

    it('filters by rider status and searches name, phone, rider ID or partner ID', async () => {
        await seedRiders();

        const inactive = await listMappings('?status=Inactive');
        assert.deepEqual(inactive.body.counts, { unmapped: 1, mapped: 0 });

        const byPartnerId = await listMappings('?view=mapped&search=blk-10');
        assert.deepEqual(byPartnerId.body.riders.map(rider => rider.riderId), ['YS-001']);
        assert.deepEqual(byPartnerId.body.counts, { unmapped: 0, mapped: 1 });

        const byRiderId = await listMappings('?search=YS-002');
        assert.deepEqual(byRiderId.body.riders.map(rider => rider.riderId), ['YS-002']);
    });

    it('pages the list', async () => {
        await seedRiders();

        const res = await listMappings('?limit=1&page=2');

        assert.equal(res.body.count, 1);
        assert.deepEqual(res.body.pagination, { page: 2, limit: 1, offset: 1, totalRecords: 2, totalPages: 2 });
    });

    it('rejects unknown filters', async () => {
        assert.equal((await listMappings('?view=all')).status, 400);
        assert.equal((await listMappings('?status=Gone')).status, 400);
        assert.equal((await listMappings('?limit=500')).status, 400);
    });

    it('a staff user can view and save mappings', async () => {
        await h.createRider('YS-001');
        const staffCookie = await h.signIn(await h.createUser({ email: 'staff@test.local' }));

        assert.equal((await h.api('GET', '/api/partner-mappings', undefined, { Cookie: staffCookie })).status, 200);
        assert.equal((await h.api('PUT', '/api/partner-mappings/riders/YS-001', {
            mappings: [{ partnerId: await partnerId('Blinkit'), partnerRiderId: 'BLK-1' }]
        }, { Cookie: staffCookie })).status, 200);
    });
});
