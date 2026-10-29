const express = require('express');
const router = express.Router();

// Import the billingController to handle requests related to billing.
const billingController = require('../controllers/billingController');
const { validateWeekStart } = require('../middleware/validateWeekStart');

// Weekly bill summary for all riders.
router.get('/summary', validateWeekStart, billingController.getWeeklyBillingSummary);

// Weekly bill for one rider.
router.get('/riders/:riderId', validateWeekStart, billingController.getRiderBill);

// Close a finished week and save its bills.
router.post('/weeks/:weekStart/close', validateWeekStart, billingController.closeWeek);

module.exports = router;
