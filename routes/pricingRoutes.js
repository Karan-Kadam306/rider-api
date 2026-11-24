const express = require('express');
const router = express.Router();

const pricingController = require('../controllers/pricingController');
const { requireRole } = require('../middleware/requireRole');

// Anyone signed in can read the prices; only admins change them.
router.get('/', pricingController.getPricing);

router.post('/postpaid-rates', requireRole('admin'), pricingController.addPostpaidRate);
router.delete('/postpaid-rates/:rateId', requireRole('admin'), pricingController.removePostpaidRate);

router.post('/deposits', requireRole('admin'), pricingController.addDepositAmount);
router.delete('/deposits/:depositId', requireRole('admin'), pricingController.removeDepositAmount);

router.post('/packs', requireRole('admin'), pricingController.createPrepaidPack);
router.patch('/packs/:packId', requireRole('admin'), pricingController.updatePrepaidPack);

module.exports = router;
