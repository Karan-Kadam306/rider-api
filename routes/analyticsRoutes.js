const express = require('express');
const router = express.Router();

const analyticsController = require('../controllers/analyticsController');

// Figures the existing endpoints cannot give. Admins and staff; team leaders are refused by restrictTeamLeader.
router.get('/team-leaders', analyticsController.getTeamLeaderStats);

module.exports = router;
