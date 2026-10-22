const express = require('express');
const router = express.Router();

const {
    getRider,
    getRiderSummary
} = require('../controllers/riderController');

// Get rider status summary.
router.get('/summary', getRiderSummary);

// Get a specific rider.
router.get('/:riderId', getRider);

module.exports = router;
