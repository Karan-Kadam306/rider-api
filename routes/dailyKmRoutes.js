
const express = require('express');
const { parse } = require('csv-parse/sync');

const router = express.Router();

const AppError = require('../errors/AppError');
const uploadDailyKmCsv = require('../middleware/uploadDailyKmCsv');
const validateUsageDate = require('../utils/validateUsageDate');
const dailyKmService = require('../services/dailyKmService');

const allowedStatuses = ['Pending', 'Validated', 'Needs Review'];

function isPositiveInteger(value) {
    return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

// List daily KM records, e.g. ?usageDate=2026-10-13&status=Needs Review
router.get('/', async (req, res, next) => {
    const { usageDate, status } = req.query;

    if (usageDate !== undefined && !validateUsageDate(usageDate)) {
        return next(
            new AppError('usageDate must be a valid date in YYYY-MM-DD format', 400)
        );
    }

    if (status !== undefined && !allowedStatuses.includes(status)) {
        return next(
            new AppError('Invalid status. Allowed values: Pending, Validated, Needs Review', 400)
        );
    }

    try {
        const records = await dailyKmService.findDailyKmRecords({
            usageDate,
            status
        });

        return res.status(200).json({
            count: records.length,
            records
        });
    } catch (error) {
        return next(error);
    }
});

// Resolve a Needs Review record.
router.patch('/:recordId/resolve', async (req, res, next) => {
    const { recordId } = req.params;
    const { bikeId, riderId, reason } = req.body ?? {};

    if (!isPositiveInteger(recordId)) {
        return next(new AppError('A valid recordId is required', 400));
    }

    if (
        typeof riderId !== 'string' ||
        !riderId.trim() ||
        typeof reason !== 'string' ||
        !reason.trim()
    ) {
        return next(
            new AppError('riderId and reason are required and must be non-empty strings', 400)
        );
    }

    if (bikeId !== undefined && !isPositiveInteger(bikeId)) {
        return next(new AppError('bikeId must be a positive integer', 400));
    }

    try {
        const record = await dailyKmService.resolveNeedsReviewRecord({
            recordId,
            bikeId,
            riderId: riderId.trim(),
            reason: reason.trim()
        });

        return res.status(200).json({
            message: 'Daily KM record resolved and validated',
            record
        });
    } catch (error) {
        return next(error);
    }
});

router.post(
    '/upload',
    uploadDailyKmCsv.single('file'),
    async (req, res) => {
        const { usageDate } = req.body;

        if (!validateUsageDate(usageDate)) {
            return res.status(400).json({
                error: 'usageDate must be a valid date in YYYY-MM-DD format'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                error: 'CSV file is required'
            });
        }

        let records;

        try {
            records = parse(req.file.buffer, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                bom: true
            });
        } catch (error) {
            return res.status(400).json({
                error: 'Unable to parse CSV file. Please check its format.'
            });
        }

        if (records.length === 0) {
            return res.status(400).json({
                error: 'CSV file contains no data rows'
            });
        }

        const headers = Object.keys(records[0]);

        if (!headers.includes('VIN') || !headers.includes('KM')) {
            return res.status(400).json({
                error: 'CSV must contain VIN and KM columns'
            });
        }

        const invalidRows = [];

        records.forEach((record, index) => {
            const vin = record.VIN;
            const kmText = record.KM;
            const km = Number(kmText);

            if (
                !vin ||
                !kmText ||
                !Number.isFinite(km) ||
                km < 0
            ) {
                invalidRows.push(index + 2);
            }
        });

        if (invalidRows.length > 0) {
            return res.status(400).json({
                error: 'Some CSV rows contain invalid VIN or KM values',
                invalidRows
            });
        }

        try {
            const result = await dailyKmService.processDailyKmUpload({
                records,
                usageDate,
                fileName: req.file.originalname
            });

            return res.status(200).json({
                message: 'Daily KM upload processed successfully',
                usageDate,
                fileName: req.file.originalname,
                totalRows: records.length,
                results: result
            });
        } catch (error) {
            console.error('Daily KM upload failed:', error);

            return res.status(500).json({
                error: 'Failed to process daily KM upload'
            });
        }
    }
);

router.post('/validate', async (req, res) => {
    const { usageDate } = req.body ?? {};

    if (!validateUsageDate(usageDate)) {
        return res.status(400).json({
            error: 'usageDate must be a valid date in YYYY-MM-DD format'
        });
    }

    try {
        const result = await dailyKmService.validateDailyKmRecords({
            usageDate
        });

        return res.status(200).json({
            message: 'Daily KM records validated successfully',
            usageDate,
            ...result
        });
    } catch (error) {
        console.error('Daily KM validation failed:', error);

        return res.status(500).json({
            error: 'Failed to validate daily KM records'
        });
    }
});

module.exports = router;
