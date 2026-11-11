const express = require('express');
const router = express.Router();

const partnerEarningController = require('../controllers/partnerEarningController');

// Pending Review queue: earnings whose partner ID is not mapped to a rider, one group per partner + ID.
router.get('/pending', partnerEarningController.listPendingEarnings);

// Map the ID to a rider and match all its pending earnings.
router.post('/pending/resolve', partnerEarningController.resolvePendingEarnings);

// Set all of the ID's pending earnings aside with a reason.
router.post('/pending/dismiss', partnerEarningController.dismissPendingEarnings);

module.exports = router;
