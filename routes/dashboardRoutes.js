const express = require('express');
const router = express.Router();

// Import the dashboardController to handle requests related to the dashboard.
const dashboardController = require('../controllers/dashboardController');
const { validateWeekStart } = require('../middleware/validateWeekStart');

// Dashboard cards and widgets for one billing week.
// e.g. ?weekStart=2026-10-12
router.get('/', validateWeekStart, dashboardController.getDashboard);

module.exports = router;
