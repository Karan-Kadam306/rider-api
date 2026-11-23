const express = require('express');
const router = express.Router();

const hubController = require('../controllers/hubController');
const { requireRole } = require('../middleware/requireRole');

// Anyone signed in can list hubs (e.g. to pick one for a bike); only admins change them.
router.get('/', hubController.listHubs);
router.post('/', requireRole('admin'), hubController.createHub);
router.patch('/:hubId', requireRole('admin'), hubController.updateHub);

module.exports = router;
