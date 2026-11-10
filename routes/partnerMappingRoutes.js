const express = require('express');
const router = express.Router();

const partnerMappingController = require('../controllers/partnerMappingController');

// Riders with or without partner IDs (?view=unmapped|mapped&status=&search=&page=&limit=), with tab counts.
router.get('/', partnerMappingController.listRiderMappings);

// Save a rider's partner IDs; the list replaces what they had.
router.put('/riders/:riderId', partnerMappingController.saveRiderMappings);

module.exports = router;
