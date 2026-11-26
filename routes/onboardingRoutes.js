const express = require('express');
const controller = require('../controllers/onboardingReviewController');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

// Reviewing rider applications: admins, staff and onboarding users.
router.use(requireRole('admin', 'staff', 'onboarding'));

router.get('/approval-options', controller.getApprovalOptions);

router.get('/applications', controller.listApplications);
router.get('/applications/counts', controller.getTabCounts);
router.get('/applications/:applicationId', controller.getApplication);
router.get('/applications/:applicationId/files/:fileId', controller.getFile);

router.patch('/applications/:applicationId/items/:item', controller.reviewItem);
router.post('/applications/:applicationId/hold', controller.hold);
router.post('/applications/:applicationId/release', controller.release);
router.post('/applications/:applicationId/request-changes', controller.requestChanges);
router.post('/applications/:applicationId/reject', controller.reject);
router.post('/applications/:applicationId/approve', controller.approve);

module.exports = router;
