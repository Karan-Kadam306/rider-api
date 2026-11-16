const express = require('express');
const router = express.Router();

const { requireRole } = require('../middleware/requireRole');
const partnerEarningController = require('../controllers/partnerEarningController');

// Pending Review queue: earnings whose partner ID is not mapped to a rider, one group per partner + ID.
router.get('/pending', partnerEarningController.listPendingEarnings);

// Map the ID to a rider and match all its pending earnings.
router.post('/pending/resolve', partnerEarningController.resolvePendingEarnings);

// Set all of the ID's pending earnings aside with a reason.
router.post('/pending/dismiss', partnerEarningController.dismissPendingEarnings);

// Earnings rows that failed to import; they block their week's payout until a corrected file or a dismiss.
router.get('/row-errors', partnerEarningController.listRowErrors);
router.post('/row-errors/:errorId/dismiss', partnerEarningController.dismissRowError);

// Admins only: move an ID's matched earnings to the rider who holds the ID now, after a wrong match.
router.get('/move-preview', requireRole('admin'), partnerEarningController.previewMove);
router.post('/move', requireRole('admin'), partnerEarningController.moveEarnings);

module.exports = router;
