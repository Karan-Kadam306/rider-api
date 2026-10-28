const express = require('express');
const router = express.Router();

const {
    getRider,
    getRiders,
    createRider,
    updateRider,
    terminateRider,
    getRiderSummary
} = require('../controllers/riderController');
const { validateRiderQuery } = require('../middleware/validateRiderQuery');
const { validateCreateRider } = require('../middleware/validateCreateRider');
const { validateUpdateRider } = require('../middleware/validateUpdateRider');

// Get all riders.
router.get('/', validateRiderQuery, getRiders);

// Create a new rider.
router.post('/', validateCreateRider, createRider);

// Get rider status summary.
router.get('/summary', getRiderSummary);

// Get a specific rider.
router.get('/:riderId', getRider);

// Update a rider.
router.put('/:riderId', validateUpdateRider, updateRider);

// Terminate a rider.
router.delete('/:riderId', terminateRider);

module.exports = router;
