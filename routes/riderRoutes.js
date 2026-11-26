const express = require('express');
const router = express.Router();

const {
    getRider,
    getRiders,
    updateRider,
    terminateRider,
    getRiderSummary,
    getRiderProfile,
    getRiderPayouts,
    getRiderAssignments
} = require('../controllers/riderController');
const inactivePeriodController = require('../controllers/inactivePeriodController');
const escalationController = require('../controllers/escalationController');
const teamLeaderController = require('../controllers/teamLeaderController');
const followUpController = require('../controllers/followUpController');
const { requireRole } = require('../middleware/requireRole');
const { validateRaiseEscalation, limitTeamLeaderEscalation } = require('../middleware/validateEscalation');
const { validateRiderQuery } = require('../middleware/validateRiderQuery');
const { validateUpdateRider } = require('../middleware/validateUpdateRider');

// Define the route for fetching a list of riders with optional query parameters for filtering and pagination.
// Riders are created only by approving an application (POST /api/onboarding/applications/:id/approve).
router.get('/', validateRiderQuery, getRiders);

// Define the route for fetching a summary of riders, which may include statistics or aggregated data.
// Takes the list's hubId and includeTest filters, so it uses the same query checks.
router.get('/summary', validateRiderQuery, getRiderSummary);

// Define the route for fetching details of a specific rider by their ID.
router.get('/:riderId', getRider);

// Define the route for updating an existing rider's information with validation of the request body.
router.put('/:riderId', validateUpdateRider, updateRider);

// Rider detail page: the overview, then the Earnings and History tabs.
router.get('/:riderId/profile', getRiderProfile);
router.get('/:riderId/payouts', getRiderPayouts);
router.get('/:riderId/assignments', getRiderAssignments);

// Escalations: anyone signed in can see them; admins raise any kind, team leaders only a Record.
router.get('/:riderId/escalations', escalationController.listEscalations);
router.post(
    '/:riderId/escalations',
    requireRole('admin', 'team_leader'),
    validateRaiseEscalation,
    limitTeamLeaderEscalation,
    escalationController.raiseEscalation
);

// Follow-ups: what the rider said when called. Anyone who can open the rider can log one.
router.get('/:riderId/follow-ups', followUpController.listFollowUps);
router.post('/:riderId/follow-ups', followUpController.logFollowUp);

// Team leaders: a rider can have several; only admins change them.
router.get('/:riderId/team-leaders', teamLeaderController.getRiderTeamLeaders);
router.post('/:riderId/team-leaders', requireRole('admin'), teamLeaderController.assignTeamLeader);
router.delete('/:riderId/team-leaders/:userId', requireRole('admin'), teamLeaderController.removeTeamLeader);

// Inactive periods: approved days are not charged rental, even if a bike was assigned.
router.get('/:riderId/inactive-periods', inactivePeriodController.listPeriods);
router.post('/:riderId/inactive-periods', inactivePeriodController.createPeriod);
router.patch('/:riderId/inactive-periods/:periodId/approve', inactivePeriodController.approvePeriod);
router.delete('/:riderId/inactive-periods/:periodId', inactivePeriodController.deletePeriod);

// Define the route for terminating a rider, which may involve deactivating their account or marking them as inactive in the system.
router.delete('/:riderId', terminateRider);

module.exports = router;
