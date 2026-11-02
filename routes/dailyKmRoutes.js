const express = require('express');

const router = express.Router();

const AppError = require('../errors/AppError');
const dailyKmService = require('../services/dailyKmService');

function isPositiveInteger(value) {
    return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

// Define the route for listing daily KM records, one page at a time.
// e.g. ?fromDate=2026-10-12&toDate=2026-10-18&status=Needs Review&search=YS-001&page=1&limit=20
router.get('/', async (req, res, next) => {
    const { fromDate, toDate, status, search, page, limit } = req.query;

    try {
        return res.status(200).json(
            await dailyKmService.findDailyKmRecords({
                fromDate,
                toDate,
                status,
                search,
                page: page ?? 1,
                limit: limit ?? 20
            })
        );
    } catch (error) {
        return next(error);
    }
});

// Define the route for resolving a Needs Review daily KM record by providing the correct bikeId and riderId.
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

// Define the route for validating every matched Pending record in a date range.
// Body: { fromDate, toDate }; a single day is fromDate = toDate.
router.post('/validate', async (req, res, next) => {
    const { fromDate, toDate } = req.body ?? {};

    try {
        const result = await dailyKmService.validateDailyKmRecords({ fromDate, toDate });

        return res.status(200).json({
            message: 'Daily KM records validated successfully',
            fromDate,
            toDate,
            ...result
        });
    } catch (error) {
        return next(error);
    }
});

// Define the route for the riders who held a bike on a date, for resolving Needs Review records.
// e.g. ?bikeId=12&usageDate=2026-10-13
router.get('/candidates', async (req, res, next) => {
    const { bikeId, usageDate } = req.query;

    try {
        const riders = await dailyKmService.findRiderCandidates({ bikeId, usageDate });

        return res.status(200).json({ count: riders.length, riders });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
