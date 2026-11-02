const express = require('express');

const router = express.Router();

const uploadCsv = require('../middleware/uploadCsv');
const importService = require('../services/importService');

// List the import types the Document Hub accepts.
router.get('/types', (req, res) => {
    res.status(200).json({ types: importService.getImportTypes() });
});

// Totals for the Document Hub summary cards.
router.get('/summary', async (req, res, next) => {
    try {
        res.status(200).json(await importService.getImportSummary());
    } catch (error) {
        next(error);
    }
});

// Import History, newest first. e.g. ?type=daily_km&status=Partial&page=1&limit=20
router.get('/', async (req, res, next) => {
    const { type, status, page, limit } = req.query;

    try {
        res.status(200).json(
            await importService.getImports({ type, status, page: page ?? 1, limit: limit ?? 20 })
        );
    } catch (error) {
        next(error);
    }
});

// One import with its failed rows.
router.get('/:importId', async (req, res, next) => {
    try {
        res.status(200).json(await importService.getImportById(req.params.importId));
    } catch (error) {
        next(error);
    }
});

// Upload a CSV (multipart fields: type, workDate, file).
router.post('/', uploadCsv.single('file'), async (req, res, next) => {
    const { type, workDate } = req.body ?? {};

    try {
        res.status(201).json(
            await importService.runImport({ importType: type, workDate, file: req.file })
        );
    } catch (error) {
        next(error);
    }
});

module.exports = router;
