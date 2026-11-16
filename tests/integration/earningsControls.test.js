const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

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

async function saveMappings(riderId, partnerRiderId, extra = {}, headers = {}) {
    const mappings = partnerRiderId ? [{ partnerId: await getBlinkitId(), partnerRiderId }] : [];
    return h.api('PUT', `/api/partner-mappings/riders/${riderId}`, { mappings, ...extra }, headers);
}

async function mappingIds(riderId) {
    const { rows } = await h.pool.query(
        'SELECT mapping_id::int AS id FROM rider_partner_mappings WHERE rider_id = $1 AND is_active',
        [riderId]
    );

    return rows.map(row => row.id);
}

describe('Saving mappings over a newer change', () => {
    beforeEach(() => h.createRider('R-1'));

    it('is refused when the mappings changed since the editor opened them', async () => {
        assert.equal((await saveMappings('R-1', 'BLK-1', { currentMappingIds: [] })).status, 200);
        const opened = await mappingIds('R-1');

        // Someone else changes the ID after the editor was opened.
        assert.equal((await saveMappings('R-1', 'BLK-2', { currentMappingIds: opened })).status, 200);

        const stale = await saveMappings('R-1', 'BLK-3', { currentMappingIds: opened });
        assert.equal(stale.status, 409);
        assert.equal(stale.body.error, 'Mappings for Rider R-1 changed since you opened them. Reload and try again.');

        const fresh = await saveMappings('R-1', 'BLK-3', { currentMappingIds: await mappingIds('R-1') });
        assert.equal(fresh.status, 200);
    });

    it('rejects currentMappingIds that are not mapping IDs', async () => {
        const res = await saveMappings('R-1', 'BLK-1', { currentMappingIds: ['x'] });

        assert.equal(res.status, 400);
    });
});

describe('Who may change a partner ID', () => {
    let staffCookie;

    beforeEach(async () => {
        await h.createRider('R-1');
        staffCookie = await h.signIn(await h.createUser({ email: 'staff@test.local' }));
    });

    it('staff can add an ID but only an admin can change or remove one', async () => {
        assert.equal((await saveMappings('R-1', 'BLK-1', {}, { Cookie: staffCookie })).status, 200);

        const change = await saveMappings('R-1', 'BLK-2', {}, { Cookie: staffCookie });
        assert.equal(change.status, 403);
        assert.equal(change.body.error, 'Only an admin can change or remove a partner ID');
        assert.equal((await saveMappings('R-1', null, {}, { Cookie: staffCookie })).status, 403);

        assert.equal((await saveMappings('R-1', 'BLK-2')).status, 200);
    });
});

describe('Earnings history', () => {
    async function changes() {
        const { rows } = await h.pool.query(
            `SELECT c.old_amount::text, c.new_amount::text, c.old_status, c.new_status, c.old_rider_id, c.new_rider_id,
                    c.import_id::int AS import_id, u.email AS changed_by
             FROM partner_earning_changes c
             LEFT JOIN users u ON u.user_id = c.changed_by
             ORDER BY c.change_id`
        );

        return rows;
    }

    it('records each change of amount, status or rider, and who or which file made it', async () => {
        await h.createRider('R-1');

        await upload(['BLK-1,A,26-10-2026,100']);
        // Same amount again: nothing changes, nothing is recorded.
        await upload(['BLK-1,A,26-10-2026,100']);
        await upload(['BLK-1,A,26-10-2026,120']);

        const resolved = await h.api('POST', '/api/partner-earnings/pending/resolve', {
            partnerId: await getBlinkitId(),
            partnerRiderId: 'BLK-1',
            riderId: 'R-1'
        });
        assert.equal(resolved.status, 200);

        assert.deepEqual(await changes(), [
            {
                old_amount: '100.00', new_amount: '120.00', old_status: 'Pending', new_status: 'Pending',
                old_rider_id: null, new_rider_id: null, import_id: 3, changed_by: 'admin@test.local'
            },
            {
                old_amount: '120.00', new_amount: '120.00', old_status: 'Pending', new_status: 'Matched',
                old_rider_id: null, new_rider_id: 'R-1', import_id: null, changed_by: 'admin@test.local'
            }
        ]);
    });
});

describe('Always ignoring a partner ID', () => {
    async function dismiss(extra) {
        return h.api('POST', '/api/partner-earnings/pending/dismiss', {
            partnerId: await getBlinkitId(),
            partnerRiderId: 'BLK-9',
            reason: 'Rider of another fleet',
            ...extra
        });
    }

    async function earning(earningDate) {
        const { rows: [row] } = await h.pool.query(
            `SELECT status, rider_id, dismiss_reason FROM partner_earnings
             WHERE partner_rider_id = 'BLK-9' AND earning_date = $1`,
            [earningDate]
        );

        return row;
    }

    it('sets the ID\'s later unmatched rows aside instead of sending them to review', async () => {
        await upload(['BLK-9,Other,26-10-2026,100']);

        const res = await dismiss({ alwaysIgnore: true });
        assert.equal(res.status, 200);
        assert.equal(res.body.alwaysIgnore, true);

        const later = await upload(['BLK-9,Other,27-10-2026,200', 'BLK-9,Other,26-10-2026,150']);

        assert.equal(later.resultSummary.ignored, 1);
        assert.equal(later.resultSummary.pending, 0);
        assert.deepEqual(await earning('2026-10-27'), { status: 'Dismissed', rider_id: null, dismiss_reason: 'Rider of another fleet' });
        // A new amount on a dismissed row stays dismissed too.
        assert.equal((await earning('2026-10-26')).status, 'Dismissed');
        assert.equal((await h.api('GET', '/api/partner-earnings/pending')).body.pagination.totalRecords, 0);
    });

    it('a mapping still wins over the ignore', async () => {
        await h.createRider('R-1');
        await upload(['BLK-9,Other,26-10-2026,100']);
        assert.equal((await dismiss({ alwaysIgnore: true })).status, 200);

        assert.equal((await saveMappings('R-1', 'BLK-9')).status, 200);
        await upload(['BLK-9,Other,27-10-2026,200']);

        assert.equal((await earning('2026-10-27')).rider_id, 'R-1');
    });

    it('without alwaysIgnore, later rows still go to review', async () => {
        await upload(['BLK-9,Other,26-10-2026,100']);
        assert.equal((await dismiss()).status, 200);

        await upload(['BLK-9,Other,27-10-2026,200']);

        assert.equal((await earning('2026-10-27')).status, 'Pending');
    });

    it('rejects an alwaysIgnore that is not true or false', async () => {
        await upload(['BLK-9,Other,26-10-2026,100']);

        assert.equal((await dismiss({ alwaysIgnore: 'yes' })).status, 400);
    });
});
