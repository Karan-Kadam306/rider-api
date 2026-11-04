const express = require('express');
const router = express.Router();

const payoutController = require('../controllers/payoutController');
const { validateWeekStart } = require('../middleware/validateWeekStart');
const { requireRole } = require('../middleware/requireRole');

// Latest payout runs across all weeks.
router.get('/recent', payoutController.getRecentPayouts);

// One week's payout status and run history.
router.get('/weeks/:weekStart', validateWeekStart, payoutController.getWeekPayout);

// Trigger or re-trigger a week's payout. Admins only.
router.post('/weeks/:weekStart/run', requireRole('admin'), validateWeekStart, payoutController.triggerPayout);

module.exports = router;
