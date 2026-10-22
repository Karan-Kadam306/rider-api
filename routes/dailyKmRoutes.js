
const express = require('express');
const { parse } = require('csv-parse/sync');

const router = express.Router();

const uploadDailyKmCsv = require('../middleware/uploadDailyKmCsv');
const validateUsageDate = require('../utils/validateUsageDate');
const dailyKmService = require('../services/dailyKmService');

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

module.exports = router;
