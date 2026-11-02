const { parse } = require('csv-parse/sync');

const { pool } = require('../db');
const AppError = require('../errors/AppError');
const importRepository = require('../repositories/importRepository');
const importTypes = require('./importTypes');
const validateUsageDate = require('../utils/validateUsageDate');

const allowedStatuses = ['Completed', 'Partial', 'Failed'];

function isPositiveInteger(value) {
    return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function mapBatch(row) {
    return {
        importId: Number(row.import_id),
        importType: row.import_type,
        fileName: row.file_name,
        fileSizeBytes: row.file_size_bytes,
        workDate: row.work_date,
        status: row.status,
        totalRows: row.total_rows,
        successRows: row.success_rows,
        failedRows: row.failed_rows,
        resultSummary: row.result_summary,
        errorMessage: row.error_message,
        uploadedBy: row.uploaded_by,
        createdAt: row.created_at
    };
}

function mapRowError(row) {
    return {
        rowNumber: row.row_number,
        rowData: row.row_data,
        errorMessage: row.error_message
    };
}

function getImportTypes() {
    return [...importTypes.values()].map(type => ({
        key: type.key,
        label: type.label,
        requiresWorkDate: type.requiresWorkDate,
        requiredColumns: type.requiredColumns
    }));
}

// Read the CSV into { headers, rows, lineNumbers }; lineNumbers[i] is rows[i]'s line in the file.
function parseCsv(buffer) {
    let headers = [];

    const records = parse(buffer, {
        // Keep the header line itself; a short first row must not hide a column.
        columns: headerLine => {
            headers = headerLine;
            return headerLine;
        },
        skip_empty_lines: true,
        trim: true,
        bom: true,
        // A short or long row becomes a row error instead of failing the whole file.
        relax_column_count: true,
        info: true
    });

    return {
        headers,
        rows: records.map(item => item.record),
        lineNumbers: records.map(item => item.info.lines)
    };
}

// Import one uploaded file. Good rows are saved, bad rows are logged with
// their reason, and the file is recorded as Completed, Partial or Failed.
async function runImport({ importType, workDate, file }) {
    const type = importTypes.get(importType);

    if (!type) {
        throw new AppError(
            `Invalid import type. Allowed values: ${[...importTypes.keys()].join(', ')}`,
            400
        );
    }

    if (!file) {
        throw new AppError('CSV file is required', 400);
    }

    if (type.requiresWorkDate && !validateUsageDate(workDate)) {
        throw new AppError('workDate must be a valid date in YYYY-MM-DD format', 400);
    }

    const batch = {
        importType,
        fileName: file.originalname,
        fileSizeBytes: file.size,
        workDate: type.requiresWorkDate ? workDate : null,
        resultSummary: {},
        errorMessage: null
    };

    // Problems with the whole file are logged as a Failed import, not thrown,
    // so they still show up in the Import History.
    let parsed;

    try {
        parsed = parseCsv(file.buffer);
    } catch {
        return saveImport({
            ...batch,
            status: 'Failed',
            totalRows: 0,
            successRows: 0,
            failedRows: 0,
            errorMessage: 'Unable to read the CSV file. Please check its format.'
        }, []);
    }

    const { headers, rows, lineNumbers } = parsed;

    if (rows.length === 0) {
        return saveImport({
            ...batch,
            status: 'Failed',
            totalRows: 0,
            successRows: 0,
            failedRows: 0,
            errorMessage: 'The file has no data rows'
        }, []);
    }

    const missingColumns = type.requiredColumns.filter(column => !headers.includes(column));

    if (missingColumns.length > 0) {
        return saveImport({
            ...batch,
            status: 'Failed',
            totalRows: rows.length,
            successRows: 0,
            failedRows: rows.length,
            errorMessage: `Missing required columns: ${missingColumns.join(', ')}`
        }, []);
    }

    const errorsByIndex = type.findRowErrors(rows, lineNumbers);
    const validRows = rows.filter((row, index) => !errorsByIndex.has(index));

    const rowErrors = [...errorsByIndex].map(([index, errorMessage]) => ({
        rowNumber: lineNumbers[index],
        rowData: rows[index],
        errorMessage
    }));

    let status = 'Partial';

    if (rowErrors.length === 0) {
        status = 'Completed';
    } else if (validRows.length === 0) {
        status = 'Failed';
    }

    return saveImport({
        ...batch,
        status,
        totalRows: rows.length,
        successRows: validRows.length,
        failedRows: rowErrors.length
    }, rowErrors, validRows, type);
}

// Save the valid rows (if any) and the import log in one transaction,
// so a crash never leaves rows saved without their import record.
async function saveImport(batch, rowErrors, validRows = [], type = null) {
    const client = await pool.connect();
    let importId;

    try {
        await client.query('BEGIN');

        const resultSummary = validRows.length > 0
            ? await type.importRows(client, validRows, batch)
            : batch.resultSummary;

        importId = await importRepository.createBatch(client, { ...batch, resultSummary });
        await importRepository.createRowErrors(client, importId, rowErrors);

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }

    return getImportById(importId);
}

async function getImports({ type, status, page = 1, limit = 20 }) {
    if (type !== undefined && !importTypes.has(type)) {
        throw new AppError(
            `Invalid import type. Allowed values: ${[...importTypes.keys()].join(', ')}`,
            400
        );
    }

    if (status !== undefined && !allowedStatuses.includes(status)) {
        throw new AppError('Invalid status. Allowed values: Completed, Partial, Failed', 400);
    }

    if (!isPositiveInteger(page) || !isPositiveInteger(limit) || Number(limit) > 100) {
        throw new AppError(
            'Page must be a positive integer and limit must be between 1 and 100',
            400
        );
    }

    page = Number(page);
    limit = Number(limit);

    const offset = (page - 1) * limit;
    const filters = { importType: type ?? null, status: status ?? null };

    const [totalRecords, rows] = await Promise.all([
        importRepository.countBatches(pool, filters),
        importRepository.findBatches(pool, { ...filters, limit, offset })
    ]);

    return {
        pagination: {
            page,
            limit,
            offset,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limit)
        },
        count: rows.length,
        imports: rows.map(mapBatch)
    };
}

async function getImportById(importId) {
    if (!isPositiveInteger(importId)) {
        throw new AppError('A valid importId is required', 400);
    }

    const [batch, rowErrors] = await Promise.all([
        importRepository.findBatchById(pool, importId),
        importRepository.findRowErrors(pool, importId)
    ]);

    if (!batch) {
        throw new AppError('Import not found', 404);
    }

    return {
        import: mapBatch(batch),
        rowErrors: rowErrors.map(mapRowError)
    };
}

async function getImportSummary() {
    const summary = await importRepository.getSummary(pool);

    return {
        totalImports: summary.total_imports,
        completedImports: summary.completed_imports,
        partialImports: summary.partial_imports,
        failedImports: summary.failed_imports,
        totalRows: summary.total_rows,
        successRows: summary.success_rows,
        failedRows: summary.failed_rows,
        // Percentage of rows imported, one decimal; null before any rows exist.
        successRate: summary.total_rows > 0
            ? Math.round((summary.success_rows / summary.total_rows) * 1000) / 10
            : null
    };
}

module.exports = {
    getImportTypes,
    runImport,
    getImports,
    getImportById,
    getImportSummary
};
