const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

const DATE = '2026-10-13';

function upload(csv, { usageDate = DATE, fileName = 'km.csv' } = {}) {
    const form = new FormData();
    form.append('usageDate', usageDate);
    form.append('file', new Blob([csv], { type: 'text/csv' }), fileName);

    return h.api('POST', '/api/daily-km/upload', form);
}

async function recordFor(vin) {
    const result = await h.pool.query(
        `SELECT km_record_id, bike_id, rider_id, status, daily_km
         FROM daily_km_records WHERE reported_vin = $1`,
        [vin]
    );

    return result.rows[0];
}

async function auditCount(recordId) {
    const result = await h.pool.query(
        `SELECT COUNT(*)::int AS n FROM daily_km_audit WHERE km_record_id = $1`,
        [recordId]
    );

    return result.rows[0].n;
}

describe('Daily KM upload', () => {
    it('rejects a file that is not CSV', async () => {
        const res = await upload('VIN,KM\nVIN-1,10', { fileName: 'km.xlsx' });

        assert.equal(res.status, 400);
    });

    it('rejects rows with invalid KM', async () => {
        const res = await upload('VIN,KM\nVIN-1,-5');

        assert.equal(res.status, 400);
        assert.deepEqual(res.body.invalidRows, [2]);
    });

    it('matched VIN becomes Pending; unknown VIN becomes Needs Review', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');

        const res = await upload('VIN,KM\nVIN-1,20\nVIN-UNKNOWN,15');

        assert.equal(res.status, 200);
        assert.deepEqual(res.body.results, { inserted: 2, unchanged: 0, corrected: 0, needsReview: 1 });

        const matched = await recordFor('VIN-1');
        assert.equal(matched.status, 'Pending');
        assert.equal(matched.rider_id, 'YS-001');

        assert.equal((await recordFor('VIN-UNKNOWN')).status, 'Needs Review');
    });

    it('identical re-upload changes nothing; changed KM goes back to Pending with an audit row', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');

        await upload('VIN,KM\nVIN-1,20');
        await h.api('POST', '/api/daily-km/validate', { usageDate: DATE });

        const same = await upload('VIN,KM\nVIN-1,20');
        assert.equal(same.body.results.unchanged, 1);
        assert.equal((await recordFor('VIN-1')).status, 'Validated');

        const changed = await upload('VIN,KM\nVIN-1,25');
        assert.equal(changed.body.results.corrected, 1);

        const record = await recordFor('VIN-1');
        assert.equal(record.status, 'Pending');
        assert.equal(Number(record.daily_km), 25);
        assert.equal(await auditCount(record.km_record_id), 1);
    });
});

describe('Daily KM validation and listing', () => {
    it('validates only matched Pending records for the date', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        await h.createKmRecord({ vin: 'VIN-1', bikeId, riderId: 'YS-001', usageDate: DATE, dailyKm: 20, status: 'Pending' });
        await h.createKmRecord({ vin: 'VIN-X', usageDate: DATE, dailyKm: 10, status: 'Needs Review' });
        await h.createKmRecord({ vin: 'VIN-1', bikeId, riderId: 'YS-001', usageDate: '2026-10-14', dailyKm: 5, status: 'Pending' });

        const res = await h.api('POST', '/api/daily-km/validate', { usageDate: DATE });

        assert.equal(res.status, 200);
        assert.equal(res.body.validated, 1);

        const list = await h.api('GET', `/api/daily-km?status=Pending`);
        assert.deepEqual(list.body.records.map(r => r.usage_date), ['2026-10-14']);
    });

    it('rejects an invalid usageDate', async () => {
        assert.equal((await h.api('POST', '/api/daily-km/validate', { usageDate: '2026-02-30' })).status, 400);
        assert.equal((await h.api('GET', '/api/daily-km?usageDate=13-10-2026')).status, 400);
    });
});

describe('Resolving Needs Review records', () => {
    async function setup() {
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        const bikeId = await h.createBike('VIN-1');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');

        // A VIN typo: the record could not be matched to a bike.
        const recordId = await h.createKmRecord({ vin: 'VIN-TYPO', usageDate: DATE, dailyKm: 20, status: 'Needs Review' });

        return { bikeId, recordId };
    }

    it('resolves to the rider who held the bike and writes an audit row', async () => {
        const { bikeId, recordId } = await setup();

        const res = await h.api('PATCH', `/api/daily-km/${recordId}/resolve`, {
            bikeId, riderId: 'YS-001', reason: 'VIN typo in CSV'
        });

        assert.equal(res.status, 200);
        assert.equal(res.body.record.status, 'Validated');
        assert.equal(res.body.record.rider_id, 'YS-001');

        const audit = await h.pool.query(`SELECT correction_reason FROM daily_km_audit WHERE km_record_id = $1`, [recordId]);
        assert.match(audit.rows[0].correction_reason, /VIN typo in CSV/);
    });

    it('rejects a rider who did not hold the bike that day', async () => {
        const { bikeId, recordId } = await setup();

        const res = await h.api('PATCH', `/api/daily-km/${recordId}/resolve`, {
            bikeId, riderId: 'YS-002', reason: 'guess'
        });

        assert.equal(res.status, 409);
        assert.equal(await auditCount(recordId), 0);
    });

    it('requires a reason', async () => {
        const { bikeId, recordId } = await setup();

        const res = await h.api('PATCH', `/api/daily-km/${recordId}/resolve`, { bikeId, riderId: 'YS-001' });

        assert.equal(res.status, 400);
    });

    it('requires bikeId when the VIN is not matched', async () => {
        const { recordId } = await setup();

        const res = await h.api('PATCH', `/api/daily-km/${recordId}/resolve`, { riderId: 'YS-001', reason: 'x' });

        assert.equal(res.status, 400);
    });

    it('only Needs Review records can be resolved', async () => {
        const { bikeId } = await setup();
        const pendingId = await h.createKmRecord({ vin: 'VIN-1', bikeId, riderId: 'YS-001', usageDate: DATE, dailyKm: 5, status: 'Pending' });

        const res = await h.api('PATCH', `/api/daily-km/${pendingId}/resolve`, { riderId: 'YS-001', reason: 'x' });

        assert.equal(res.status, 409);
    });

    it('returns 404 for an unknown record', async () => {
        const res = await h.api('PATCH', '/api/daily-km/999/resolve', { riderId: 'YS-001', reason: 'x' });

        assert.equal(res.status, 404);
    });
});
