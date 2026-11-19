const express = require('express');
const router = express.Router();

const teamLeaderController = require('../controllers/teamLeaderController');
const { requireRole } = require('../middleware/requireRole');

// The team leader's own pages. Rider details reuse /api/riders/:riderId/..., which
// restrictTeamLeader opens only for the team leader's own riders.
router.use(requireRole('team_leader'));

router.get('/riders', teamLeaderController.listMyRiders);

module.exports = router;
