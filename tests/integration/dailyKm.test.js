const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

const DATE = '2026-10-13';

async function auditCount(recordId) {
    const result = await h.pool.query(
        `SELECT COUNT(*)::int AS n FROM daily_km_audit WHERE km_record_id = $1`,
        [recordId]
    );

    return result.rows[0].n;
}

describe('Daily KM validation and listing', () => {
    it('validates only matched Pending records for the date', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        await h.createKmRecord({ vin: 'VIN-1', bikeId, riderId: 'YS-001', usageDate: DATE, dailyKm: 20, status: 'Pending' });
        await h.createKmRecord({ vin: 'VIN-X', usageDate: DATE, dailyKm: 10, status: 'Needs Review' });
        await h.createKmRecord({ vin: 'VIN-1', bikeId, riderId: 'YS-001', usageDate: '2026-10-14', dailyKm: 5, status: 'Pending' });

        const res = await h.api('POST', '/api/daily-km/validate', { fromDate: DATE, toDate: DATE });

        assert.equal(res.status, 200);
        assert.equal(res.body.validated, 1);

        const list = await h.api('GET', `/api/daily-km?status=Pending`);
        assert.deepEqual(list.body.records.map(r => r.usage_date), ['2026-10-14']);
    });

    it('validates a whole date range in one call', async () => {
        await h.createRider('YS-001');
        const bikeId = await h.createBike('VIN-1');
        for (const usageDate of ['2026-10-11', '2026-10-12', '2026-10-18', '2026-10-19']) {
            await h.createKmRecord({ vin: 'VIN-1', bikeId, riderId: 'YS-001', usageDate, dailyKm: 10, status: 'Pending' });
        }

        const res = await h.api('POST', '/api/daily-km/validate', { fromDate: '2026-10-12', toDate: '2026-10-18' });

        assert.equal(res.body.validated, 2);

        // Both ends are inclusive; the days outside stay Pending.
        const pending = await h.api('GET', '/api/daily-km?status=Pending');
        assert.deepEqual(pending.body.records.map(r => r.usage_date), ['2026-10-19', '2026-10-11']);
    });

    it('rejects a missing, invalid or reversed range', async () => {
        const validate = body => h.api('POST', '/api/daily-km/validate', body);

        assert.equal((await validate({ fromDate: DATE })).status, 400);
        assert.equal((await validate({ fromDate: '2026-02-30', toDate: DATE })).status, 400);
        assert.equal((await validate({ fromDate: '2026-10-18', toDate: '2026-10-12' })).status, 400);
        // The old single-day field is no longer accepted.
        assert.equal((await validate({ usageDate: DATE })).status, 400);
    });
});

describe('Rider candidates for resolving', () => {
    function candidates(bikeId, usageDate) {
        return h.api('GET', `/api/daily-km/candidates?bikeId=${bikeId}&usageDate=${usageDate}`);
    }

    it('lists every rider who held the bike on that day, in hand-over order', async () => {
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        await h.createRider('YS-003');
        const bikeId = await h.createBike('VIN-1');
        // YS-001 hands over to YS-002 at noon on the 13th; YS-003 held it the week before.
        await h.createAssignment(bikeId, 'YS-003', '2026-10-01 09:00', '2026-10-05 18:00');
        await h.createAssignment(bikeId, 'YS-001', '2026-10-06 09:00', '2026-10-13 12:00');
        await h.createAssignment(bikeId, 'YS-002', '2026-10-13 12:30');

        const res = await candidates(bikeId, DATE);

        assert.equal(res.status, 200);
        assert.deepEqual(
            res.body.riders.map(rider => [rider.riderId, rider.riderName]),
            [['YS-001', 'Rider YS-001'], ['YS-002', 'Rider YS-002']]
        );

        // The next day only the current holder is left.
        const nextDay = await candidates(bikeId, '2026-10-14');
        assert.deepEqual(nextDay.body.riders.map(rider => rider.riderId), ['YS-002']);
    });

    it('is empty when nobody held the bike that day', async () => {
        const bikeId = await h.createBike('VIN-1');

        const res = await candidates(bikeId, DATE);

        assert.equal(res.status, 200);
        assert.deepEqual(res.body.riders, []);
    });

    it('rejects a bad bikeId or usageDate', async () => {
        assert.equal((await candidates('abc', DATE)).status, 400);
        assert.equal((await candidates(1, '2026-02-30')).status, 400);
    });
});

describe('Daily KM list', () => {
    // Week of 2026-10-12: YS-001 on VIN-1 (Pending, Validated), an unknown VIN (Needs Review),
    // and one record the week before.
    async function seedWeek() {
        await h.createRider('YS-001');
        await h.createRider('YS-002');
        const bike1 = await h.createBike('VIN-1');
        const bike2 = await h.createBike('VIN-2');

        await h.createKmRecord({ vin: 'VIN-1', bikeId: bike1, riderId: 'YS-001', usageDate: '2026-10-12', dailyKm: 10, status: 'Validated' });
        await h.createKmRecord({ vin: 'VIN-1', bikeId: bike1, riderId: 'YS-001', usageDate: '2026-10-14', dailyKm: 20, status: 'Pending' });
        await h.createKmRecord({ vin: 'VIN-2', bikeId: bike2, riderId: 'YS-002', usageDate: '2026-10-18', dailyKm: 30, status: 'Pending' });
        await h.createKmRecord({ vin: 'VIN-UNKNOWN', usageDate: '2026-10-13', dailyKm: 15, status: 'Needs Review' });
        await h.createKmRecord({ vin: 'VIN-1', bikeId: bike1, riderId: 'YS-001', usageDate: '2026-10-05', dailyKm: 5, status: 'Pending' });
    }

    function list(query) {
        return h.api('GET', `/api/daily-km?${new URLSearchParams(query)}`);
    }

    it('returns the date range newest first with chassis number and rider name', async () => {
        await seedWeek();

        const res = await list({ fromDate: '2026-10-12', toDate: '2026-10-18' });

        assert.equal(res.status, 200);
        assert.deepEqual(res.body.records.map(r => r.usage_date), ['2026-10-18', '2026-10-14', '2026-10-13', '2026-10-12']);
        assert.equal(res.body.pagination.totalRecords, 4);

        const matched = res.body.records[1];
        assert.equal(matched.chassis_number, 'VIN-1');
        assert.equal(matched.rider_name, 'Rider YS-001');

        // An unmatched VIN has no bike or rider yet.
        const unmatched = res.body.records[2];
        assert.equal(unmatched.chassis_number, null);
        assert.equal(unmatched.rider_name, null);
    });

    it('status counts cover the whole range, even when a status tab is selected', async () => {
        await seedWeek();

        const res = await list({ fromDate: '2026-10-12', toDate: '2026-10-18', status: 'Pending' });

        assert.deepEqual(res.body.records.map(r => r.reported_vin), ['VIN-2', 'VIN-1']);
        assert.deepEqual(res.body.statusCounts, { Pending: 2, Validated: 1, 'Needs Review': 1 });
        assert.equal(res.body.pagination.totalRecords, 2);
    });

    it('statusCounts are all zero for an empty range', async () => {
        const res = await list({ fromDate: '2026-10-12', toDate: '2026-10-18' });

        assert.deepEqual(res.body.statusCounts, { Pending: 0, Validated: 0, 'Needs Review': 0 });
        assert.equal(res.body.pagination.totalPages, 0);
        assert.deepEqual(res.body.records, []);
    });

    it('searches VIN, rider ID and rider name (case-insensitive)', async () => {
        await seedWeek();
        const range = { fromDate: '2026-10-12', toDate: '2026-10-18' };

        const byVin = await list({ ...range, search: 'unknown' });
        assert.deepEqual(byVin.body.records.map(r => r.reported_vin), ['VIN-UNKNOWN']);

        const byRiderId = await list({ ...range, search: 'ys-002' });
        assert.deepEqual(byRiderId.body.records.map(r => r.rider_id), ['YS-002']);

        const byName = await list({ ...range, search: 'Rider YS-001' });
        assert.equal(byName.body.records.length, 2);
        // Counts follow the search too.
        assert.deepEqual(byName.body.statusCounts, { Pending: 1, Validated: 1, 'Needs Review': 0 });
    });

    it('pages through the results', async () => {
        await seedWeek();

        const page2 = await list({ fromDate: '2026-10-12', toDate: '2026-10-18', page: 2, limit: 3 });

        assert.deepEqual(page2.body.records.map(r => r.usage_date), ['2026-10-12']);
        assert.equal(page2.body.pagination.totalPages, 2);
    });

    it('without dates, lists every record', async () => {
        await seedWeek();

        const res = await list({});

        assert.equal(res.body.pagination.totalRecords, 5);
    });

    it('rejects invalid dates, a reversed range, an unknown status and bad paging', async () => {
        assert.equal((await list({ fromDate: '13-10-2026' })).status, 400);
        assert.equal((await list({ toDate: '2026-02-30' })).status, 400);
        assert.equal((await list({ fromDate: '2026-10-18', toDate: '2026-10-12' })).status, 400);
        assert.equal((await list({ status: 'Done' })).status, 400);
        assert.equal((await list({ limit: 101 })).status, 400);
        assert.equal((await list({ page: 0 })).status, 400);
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
