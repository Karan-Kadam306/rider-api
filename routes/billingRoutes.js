const express = require('express');
const router = express.Router();

// Import the billingController to handle requests related to billing.
const billingController = require('../controllers/billingController');
const { validateWeekStart } = require('../middleware/validateWeekStart');
const { requireRole } = require('../middleware/requireRole');

// Weekly bill summary for all riders.
router.get('/summary', validateWeekStart, billingController.getWeeklyBillingSummary);

// One page of the week's bills, filtered by view and search.
router.get('/bills', validateWeekStart, billingController.listWeeklyBills);

// The week's bills as a CSV download.
router.get('/bills/export', validateWeekStart, billingController.exportWeeklyBills);

// Weekly bill for one rider.
router.get('/riders/:riderId', validateWeekStart, billingController.getRiderBill);

// Close a finished week and save its bills. Admins only.
router.post('/weeks/:weekStart/close', requireRole('admin'), validateWeekStart, billingController.closeWeek);

module.exports = router;
