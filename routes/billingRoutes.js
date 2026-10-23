const express = require('express');
const router = express.Router();

const billingController = require('../controllers/billingController');
const { validateWeekStart } = require('../middleware/validateWeekStart');

// Weekly bill summary for all riders.
router.get('/summary', validateWeekStart, billingController.getWeeklyBillingSummary);

// Weekly bill for one rider.
router.get('/riders/:riderId', validateWeekStart, billingController.getRiderBill);

module.exports = router;
