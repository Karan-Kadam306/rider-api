const BATCH_COLUMNS = `
    import_id,
    import_type,
    file_name,
    file_size_bytes,
    TO_CHAR(work_date, 'YYYY-MM-DD') AS work_date,
    status,
    total_rows,
    success_rows,
    failed_rows,
    result_summary,
    error_message,
    uploaded_by,
    created_at`;

// Log one uploaded file and return its new ID.
async function createBatch(client, batch) {
    const result = await client.query(
        `INSERT INTO import_batches (
            import_type,
            file_name,
            file_size_bytes,
            work_date,
            status,
            total_rows,
            success_rows,
            failed_rows,
            result_summary,
            error_message
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING import_id`,
        [
            batch.importType,
            batch.fileName,
            batch.fileSizeBytes,
            batch.workDate,
            batch.status,
            batch.totalRows,
            batch.successRows,
            batch.failedRows,
            batch.resultSummary,
            batch.errorMessage
        ]
    );

    return result.rows[0].import_id;
}

// Save all failed rows of an import in one statement.
async function createRowErrors(client, importId, rowErrors) {
    if (rowErrors.length === 0) {
        return;
    }

    await client.query(
        `INSERT INTO import_row_errors (import_id, row_number, row_data, error_message)
         SELECT $1, *
         FROM UNNEST($2::int[], $3::jsonb[], $4::text[])`,
        [
            importId,
            rowErrors.map(rowError => rowError.rowNumber),
            rowErrors.map(rowError => JSON.stringify(rowError.rowData)),
            rowErrors.map(rowError => rowError.errorMessage)
        ]
    );
}

// Newest imports first; importType and status are optional filters.
async function findBatches(client, { importType, status, limit, offset }) {
    const result = await client.query(
        `SELECT ${BATCH_COLUMNS}
         FROM import_batches
         WHERE ($1::text IS NULL OR import_type = $1)
           AND ($2::text IS NULL OR status = $2)
         ORDER BY created_at DESC, import_id DESC
         LIMIT $3 OFFSET $4`,
        [importType, status, limit, offset]
    );

    return result.rows;
}

async function countBatches(client, { importType, status }) {
    const result = await client.query(
        `SELECT COUNT(*) AS total
         FROM import_batches
         WHERE ($1::text IS NULL OR import_type = $1)
           AND ($2::text IS NULL OR status = $2)`,
        [importType, status]
    );

    return Number(result.rows[0].total);
}

async function findBatchById(client, importId) {
    const result = await client.query(
        `SELECT ${BATCH_COLUMNS}
         FROM import_batches
         WHERE import_id = $1`,
        [importId]
    );

    return result.rows[0] ?? null;
}

async function findRowErrors(client, importId) {
    const result = await client.query(
        `SELECT row_number, row_data, error_message
         FROM import_row_errors
         WHERE import_id = $1
         ORDER BY row_number`,
        [importId]
    );

    return result.rows;
}

// Totals across all imports for the Document Hub summary cards.
async function getSummary(client) {
    const result = await client.query(
        `SELECT
            COUNT(*)::int AS total_imports,
            COUNT(*) FILTER (WHERE status = 'Completed')::int AS completed_imports,
            COUNT(*) FILTER (WHERE status = 'Partial')::int AS partial_imports,
            COUNT(*) FILTER (WHERE status = 'Failed')::int AS failed_imports,
            COALESCE(SUM(total_rows), 0)::int AS total_rows,
            COALESCE(SUM(success_rows), 0)::int AS success_rows,
            COALESCE(SUM(failed_rows), 0)::int AS failed_rows
         FROM import_batches`
    );

    return result.rows[0];
}

module.exports = {
    createBatch,
    createRowErrors,
    findBatches,
    countBatches,
    findBatchById,
    findRowErrors,
    getSummary
};
