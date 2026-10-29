const express = require('express');
const router = express.Router();

const dashboardController = require('../controllers/dashboardController');
const { validateWeekStart } = require('../middleware/validateWeekStart');

// Dashboard cards and widgets for one billing week.
router.get('/', validateWeekStart, dashboardController.getDashboard);

module.exports = router;
