const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

const DATE = '2026-10-13';

// Pass null to leave a form field out.
function upload(csv, { type = 'daily_km', workDate = DATE, fileName = 'km.csv' } = {}) {
    const form = new FormData();

    if (type !== null) form.append('type', type);
    if (workDate !== null) form.append('workDate', workDate);
    if (csv !== null) form.append('file', new Blob([csv], { type: 'text/csv' }), fileName);

    return h.api('POST', '/api/imports', form);
}

async function recordFor(vin) {
    const result = await h.pool.query(
        `SELECT km_record_id, rider_id, status, daily_km, source_file_name
         FROM daily_km_records WHERE reported_vin = $1`,
        [vin]
    );

    return result.rows[0];
}

async function countRows(table) {
    const result = await h.pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
    return result.rows[0].n;
}

// Rider YS-001 holds VIN-1 for the whole test week.
async function riderOnBike() {
    await h.createRider('YS-001');
    const bikeId = await h.createBike('VIN-1');
    await h.createAssignment(bikeId, 'YS-001', '2026-10-01 09:00');
}

describe('POST /api/imports request checks (nothing is logged)', () => {
    it('rejects a file that is not CSV', async () => {
        const res = await upload('VIN,KM\nVIN-1,10', { fileName: 'km.xlsx' });

        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'Only CSV files are allowed');
    });

    it('rejects an unknown or missing import type', async () => {
        assert.equal((await upload('VIN,KM\nVIN-1,10', { type: 'bikes_v2' })).status, 400);
        assert.equal((await upload('VIN,KM\nVIN-1,10', { type: null })).status, 400);
    });

    it('requires a valid workDate for Daily KM', async () => {
        assert.equal((await upload('VIN,KM\nVIN-1,10', { workDate: null })).status, 400);
        assert.equal((await upload('VIN,KM\nVIN-1,10', { workDate: '2026-02-30' })).status, 400);
    });

    it('requires a file', async () => {
        const res = await upload(null);

        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'CSV file is required');
    });

    it('rejects a file larger than 5 MB', async () => {
        const res = await upload('VIN,KM\n' + 'x'.repeat(5 * 1024 * 1024));

        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'File is too large. Maximum size is 5 MB');
    });

    it('logs nothing for rejected requests', async () => {
        await upload('VIN,KM\nVIN-1,10', { fileName: 'km.xlsx' });
        await upload('VIN,KM\nVIN-1,10', { workDate: null });

        assert.equal(await countRows('import_batches'), 0);
    });
});

describe('Daily KM import', () => {
    it('Completed: matched VIN becomes Pending, unknown VIN becomes Needs Review', async () => {
        await riderOnBike();

        const res = await upload('VIN,KM\nVIN-1,20\nVIN-UNKNOWN,15');

        assert.equal(res.status, 201);
        assert.equal(res.body.import.status, 'Completed');
        assert.equal(res.body.import.importType, 'daily_km');
        assert.equal(res.body.import.workDate, DATE);
        assert.equal(res.body.import.fileName, 'km.csv');
        assert.equal(res.body.import.totalRows, 2);
        assert.equal(res.body.import.successRows, 2);
        assert.equal(res.body.import.failedRows, 0);
        assert.deepEqual(res.body.import.resultSummary, { inserted: 2, unchanged: 0, corrected: 0, needsReview: 1 });
        assert.deepEqual(res.body.rowErrors, []);

        const matched = await recordFor('VIN-1');
        assert.equal(matched.status, 'Pending');
        assert.equal(matched.rider_id, 'YS-001');
        assert.equal((await recordFor('VIN-UNKNOWN')).status, 'Needs Review');
    });

    it('Partial: good rows are saved, bad rows are logged with their file line number', async () => {
        await riderOnBike();

        // Line 4 is blank, so later rows keep their real line numbers.
        const csv = [
            'VIN,KM',        // line 1
            'VIN-1,20',      // line 2  ok
            'VIN-2,-5',      // line 3  negative KM
            '',              // line 4  blank, skipped
            ',12',           // line 5  missing VIN
            'VIN-3,abc',     // line 6  not a number
            'VIN-1,30',      // line 7  duplicate VIN
            'VIN-4'          // line 8  missing KM column
        ].join('\n');

        const res = await upload(csv);

        assert.equal(res.status, 201);
        assert.equal(res.body.import.status, 'Partial');
        assert.equal(res.body.import.totalRows, 6);
        assert.equal(res.body.import.successRows, 1);
        assert.equal(res.body.import.failedRows, 5);

        assert.deepEqual(
            res.body.rowErrors.map(rowError => [rowError.rowNumber, rowError.errorMessage]),
            [
                [3, 'KM must be a number of 0 or more'],
                [5, 'VIN is required'],
                [6, 'KM must be a number of 0 or more'],
                [7, 'VIN already appears on line 2'],
                [8, 'KM is required']
            ]
        );
        assert.deepEqual(res.body.rowErrors[0].rowData, { VIN: 'VIN-2', KM: '-5' });

        // Only the good row reached daily_km_records, with its original KM.
        assert.equal(await countRows('daily_km_records'), 1);
        assert.equal(Number((await recordFor('VIN-1')).daily_km), 20);
    });

    it('Failed: every row invalid saves no records', async () => {
        const res = await upload('VIN,KM\nVIN-1,-1\nVIN-2,x');

        assert.equal(res.status, 201);
        assert.equal(res.body.import.status, 'Failed');
        assert.equal(res.body.import.successRows, 0);
        assert.equal(res.body.import.failedRows, 2);
        assert.equal(res.body.rowErrors.length, 2);
        assert.equal(await countRows('daily_km_records'), 0);
    });

    it('Failed: missing required columns is logged with a reason', async () => {
        const res = await upload('VIN,Distance\nVIN-1,10');

        assert.equal(res.status, 201);
        assert.equal(res.body.import.status, 'Failed');
        assert.equal(res.body.import.errorMessage, 'Missing required columns: KM');
        assert.equal(res.body.import.failedRows, 1);
        assert.equal(await countRows('daily_km_records'), 0);
    });

    it('a short first row is a row error, not a missing column', async () => {
        const res = await upload('VIN,KM\nVIN-1\nVIN-2,10');

        assert.equal(res.body.import.status, 'Partial');
        assert.equal(res.body.import.errorMessage, null);
        assert.deepEqual(res.body.rowErrors.map(rowError => rowError.errorMessage), ['KM is required']);
    });

    it('Failed: a file with only a header is logged with a reason', async () => {
        const res = await upload('VIN,KM\n');

        assert.equal(res.status, 201);
        assert.equal(res.body.import.status, 'Failed');
        assert.equal(res.body.import.errorMessage, 'The file has no data rows');
        assert.equal(res.body.import.totalRows, 0);
    });

    it('Failed: an unreadable CSV is logged with a reason', async () => {
        const res = await upload('VIN,KM\n"VIN-1,10');

        assert.equal(res.status, 201);
        assert.equal(res.body.import.status, 'Failed');
        assert.equal(res.body.import.errorMessage, 'Unable to read the CSV file. Please check its format.');
    });

    it('identical re-upload is unchanged; changed KM is corrected with an audit row', async () => {
        await riderOnBike();

        await upload('VIN,KM\nVIN-1,20');
        await h.api('POST', '/api/daily-km/validate', { fromDate: DATE, toDate: DATE });

        const same = await upload('VIN,KM\nVIN-1,20');
        assert.equal(same.body.import.resultSummary.unchanged, 1);
        assert.equal((await recordFor('VIN-1')).status, 'Validated');

        const changed = await upload('VIN,KM\nVIN-1,25', { fileName: 'km-fixed.csv' });
        assert.equal(changed.body.import.resultSummary.corrected, 1);

        const record = await recordFor('VIN-1');
        assert.equal(record.status, 'Pending');
        assert.equal(Number(record.daily_km), 25);
        assert.equal(record.source_file_name, 'km-fixed.csv');
        assert.equal(await countRows('daily_km_audit'), 1);
    });
});

describe('Import History', () => {
    async function seedHistory() {
        await upload('VIN,KM\nVIN-1,10', { fileName: 'a.csv' });           // Completed
        await upload('VIN,KM\nVIN-2,10\nVIN-3,-1', { fileName: 'b.csv' }); // Partial
        await upload('VIN,KM\nVIN-4,x', { fileName: 'c.csv' });            // Failed
    }

    it('lists newest first with pagination', async () => {
        await seedHistory();

        const res = await h.api('GET', '/api/imports?page=1&limit=2');

        assert.equal(res.status, 200);
        assert.deepEqual(res.body.imports.map(item => item.fileName), ['c.csv', 'b.csv']);
        assert.equal(res.body.pagination.totalRecords, 3);
        assert.equal(res.body.pagination.totalPages, 2);

        const page2 = await h.api('GET', '/api/imports?page=2&limit=2');
        assert.deepEqual(page2.body.imports.map(item => item.fileName), ['a.csv']);
    });

    it('filters by status and type', async () => {
        await seedHistory();

        const partial = await h.api('GET', '/api/imports?status=Partial');
        assert.deepEqual(partial.body.imports.map(item => item.fileName), ['b.csv']);

        const dailyKm = await h.api('GET', '/api/imports?type=daily_km');
        assert.equal(dailyKm.body.pagination.totalRecords, 3);
    });

    it('rejects invalid filters and paging', async () => {
        assert.equal((await h.api('GET', '/api/imports?status=Done')).status, 400);
        assert.equal((await h.api('GET', '/api/imports?type=nope')).status, 400);
        assert.equal((await h.api('GET', '/api/imports?limit=101')).status, 400);
        assert.equal((await h.api('GET', '/api/imports?page=0')).status, 400);
    });

    it('returns one import with its failed rows', async () => {
        const created = await upload('VIN,KM\nVIN-2,10\nVIN-3,-1');

        const res = await h.api('GET', `/api/imports/${created.body.import.importId}`);

        assert.equal(res.status, 200);
        assert.equal(res.body.import.status, 'Partial');
        assert.deepEqual(res.body.rowErrors.map(rowError => rowError.rowNumber), [3]);
    });

    it('returns 404 for an unknown import and 400 for a bad ID', async () => {
        assert.equal((await h.api('GET', '/api/imports/999')).status, 404);
        assert.equal((await h.api('GET', '/api/imports/abc')).status, 400);
    });
});

describe('Import summary and types', () => {
    it('summary is empty before any import', async () => {
        const res = await h.api('GET', '/api/imports/summary');

        assert.equal(res.status, 200);
        assert.equal(res.body.totalImports, 0);
        assert.equal(res.body.successRate, null);
    });

    it('summary totals imports and rows across statuses', async () => {
        await upload('VIN,KM\nVIN-1,10\nVIN-2,10');           // Completed 2/2
        await upload('VIN,KM\nVIN-3,10\nVIN-4,-1');           // Partial   1/2
        await upload('VIN,KM\nVIN-5,x');                      // Failed    0/1

        const res = await h.api('GET', '/api/imports/summary');

        assert.deepEqual(res.body, {
            totalImports: 3,
            completedImports: 1,
            partialImports: 1,
            failedImports: 1,
            totalRows: 5,
            successRows: 3,
            failedRows: 2,
            successRate: 60
        });
    });

    it('lists the available import types', async () => {
        const res = await h.api('GET', '/api/imports/types');

        assert.equal(res.status, 200);
        assert.deepEqual(res.body.types, [
            { key: 'daily_km', label: 'Daily KM', requiresWorkDate: true, requiredColumns: ['VIN', 'KM'] }
        ]);
    });
});
