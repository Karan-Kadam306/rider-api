const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

// Insert an import batch; only the counts and status vary between tests.
async function insertBatch({ status, totalRows, successRows, failedRows }) {
    const result = await h.pool.query(
        `INSERT INTO import_batches
            (import_type, file_name, file_size_bytes, work_date, status, total_rows, success_rows, failed_rows)
         VALUES ('daily_km', 'km.csv', 1024, '2026-10-13', $1, $2, $3, $4)
         RETURNING import_id, result_summary, created_at`,
        [status, totalRows, successRows, failedRows]
    );

    return result.rows[0];
}

// Postgres CHECK violations use SQLSTATE 23514.
async function assertCheckViolation(promise, constraint) {
    await assert.rejects(promise, error => error.code === '23514' && error.constraint === constraint);
}

describe('import_batches status and row counts', () => {
    it('accepts Completed, Partial and Failed when the counts agree', async () => {
        const completed = await insertBatch({ status: 'Completed', totalRows: 10, successRows: 10, failedRows: 0 });
        await insertBatch({ status: 'Partial', totalRows: 10, successRows: 8, failedRows: 2 });
        await insertBatch({ status: 'Failed', totalRows: 0, successRows: 0, failedRows: 0 });

        assert.deepEqual(completed.result_summary, {});
        assert.ok(completed.created_at instanceof Date);
    });

    it('rejects an unknown status', async () => {
        await assertCheckViolation(
            insertBatch({ status: 'Done', totalRows: 1, successRows: 1, failedRows: 0 }),
            'import_batches_status_check'
        );
    });

    it('rejects success + failed rows that do not add up to total rows', async () => {
        await assertCheckViolation(
            insertBatch({ status: 'Partial', totalRows: 10, successRows: 5, failedRows: 2 }),
            'import_batches_counts_check'
        );
    });

    it('rejects Completed with failed rows', async () => {
        await assertCheckViolation(
            insertBatch({ status: 'Completed', totalRows: 10, successRows: 9, failedRows: 1 }),
            'import_batches_status_counts_check'
        );
    });

    it('rejects Partial when every row failed', async () => {
        await assertCheckViolation(
            insertBatch({ status: 'Partial', totalRows: 3, successRows: 0, failedRows: 3 }),
            'import_batches_status_counts_check'
        );
    });

    it('rejects Failed with successful rows', async () => {
        await assertCheckViolation(
            insertBatch({ status: 'Failed', totalRows: 3, successRows: 1, failedRows: 2 }),
            'import_batches_status_counts_check'
        );
    });
});

describe('import_row_errors', () => {
    async function insertRowError(importId, rowNumber) {
        await h.pool.query(
            `INSERT INTO import_row_errors (import_id, row_number, row_data, error_message)
             VALUES ($1, $2, $3, 'KM must be a non-negative number')`,
            [importId, rowNumber, { VIN: 'VIN-1', KM: 'abc' }]
        );
    }

    it('stores the failed row values as JSON', async () => {
        const batch = await insertBatch({ status: 'Partial', totalRows: 2, successRows: 1, failedRows: 1 });
        await insertRowError(batch.import_id, 2);

        const result = await h.pool.query('SELECT row_data FROM import_row_errors');

        assert.deepEqual(result.rows[0].row_data, { VIN: 'VIN-1', KM: 'abc' });
    });

    it('rejects the header line (row 1) and duplicate row numbers', async () => {
        const batch = await insertBatch({ status: 'Partial', totalRows: 3, successRows: 1, failedRows: 2 });
        await insertRowError(batch.import_id, 2);

        await assertCheckViolation(insertRowError(batch.import_id, 1), 'import_row_errors_row_number_check');
        await assert.rejects(
            insertRowError(batch.import_id, 2),
            error => error.code === '23505' && error.constraint === 'import_row_errors_import_row_key'
        );
    });

    it('rejects an error for a batch that does not exist', async () => {
        await assert.rejects(insertRowError(999, 2), error => error.code === '23503');
    });

    it('is deleted together with its batch', async () => {
        const batch = await insertBatch({ status: 'Partial', totalRows: 2, successRows: 1, failedRows: 1 });
        await insertRowError(batch.import_id, 2);

        await h.pool.query('DELETE FROM import_batches WHERE import_id = $1', [batch.import_id]);

        const result = await h.pool.query('SELECT COUNT(*)::int AS total FROM import_row_errors');
        assert.equal(result.rows[0].total, 0);
    });
});
