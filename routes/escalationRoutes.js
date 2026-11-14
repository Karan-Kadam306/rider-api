const express = require('express');
const router = express.Router();

const escalationController = require('../controllers/escalationController');
const { requireRole } = require('../middleware/requireRole');
const { validateEscalationId, validateEscalationText } = require('../middleware/validateEscalation');

// Every escalation action is for admins only.
router.use(requireRole('admin'));
router.use('/:escalationId', validateEscalationId);

// Manual fallback when the rider paid but the payment webhook did not arrive.
router.post('/:escalationId/mark-paid', validateEscalationText('reference'), escalationController.markPaid);

// Forgive a Charge or Payment Due.
router.post('/:escalationId/waive', validateEscalationText('reason'), escalationController.waive);

// End a Record escalation (one raised without an amount).
router.post('/:escalationId/close', validateEscalationText('note'), escalationController.close);

// Try the bike lock again after the IoT service failed.
router.post('/:escalationId/retry-lock', escalationController.retryLock);

module.exports = router;
