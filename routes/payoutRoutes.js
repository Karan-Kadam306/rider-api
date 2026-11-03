const express = require('express');
const router = express.Router();

const payoutController = require('../controllers/payoutController');
const { validateWeekStart } = require('../middleware/validateWeekStart');

// Latest payout runs across all weeks.
router.get('/recent', payoutController.getRecentPayouts);

// One week's payout status and run history.
router.get('/weeks/:weekStart', validateWeekStart, payoutController.getWeekPayout);

// Trigger or re-trigger a week's payout.
router.post('/weeks/:weekStart/run', validateWeekStart, payoutController.triggerPayout);

module.exports = router;
