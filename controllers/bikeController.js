const bikeService = require('../services/bikeService');

// POST /api/bikes
async function createBike(req, res, next) {
    try {
        const bike = await bikeService.createBike({
            registrationNumber: req.body?.registrationNumber,
            chassisNumber: req.body?.chassisNumber
        });

        return res.status(201).json({ bike });
    } catch (error) {
        return next(error);
    }
}

// GET /api/bikes
async function getBikes(req, res, next) {
    try {
        const result = await bikeService.getBikes({
            status: req.query.status,
            search: req.query.search,
            page: req.query.page ?? 1,
            limit: req.query.limit ?? 20
        });

        return res.status(200).json(result);
    } catch (error) {
        return next(error);
    }
}

// GET /api/bikes/summary
async function getBikeSummary(req, res, next) {
    try {
        const summary = await bikeService.getBikeStatusSummary();

        return res.status(200).json({ summary });
    } catch (error) {
        return next(error);
    }
}

// GET /api/bikes/:bikeId
async function getBike(req, res, next) {
    try {
        const bike = await bikeService.getBikeById(req.params.bikeId);

        return res.status(200).json({ bike });
    } catch (error) {
        return next(error);
    }
}

// PATCH /api/bikes/:bikeId/status
async function updateBikeStatus(req, res, next) {
    try {
        const bike = await bikeService.updateBikeStatus(
            req.params.bikeId,
            req.body?.status
        );

        return res.status(200).json({
            message: 'Bike status updated successfully',
            bike
        });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    createBike,
    getBikes,
    getBikeSummary,
    getBike,
    updateBikeStatus
};
