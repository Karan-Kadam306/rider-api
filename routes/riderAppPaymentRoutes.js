const express = require('express');
const router = express.Router();

const controller = require('../controllers/riderPaymentController');

// Mounted at /api/rider-app behind requireRider: every route works on the signed-in phone's own
// application and orders, so no rider ID is ever taken from the URL.
router.get('/payments', controller.getPayments);
router.post('/payments/orders', controller.createOrder);
router.get('/payments/orders/:orderId', controller.getOrder);
router.post('/payments/orders/:orderId/mock-capture', controller.mockCapture);

module.exports = router;
