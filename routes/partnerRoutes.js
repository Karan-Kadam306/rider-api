const express = require('express');
const router = express.Router();

const partnerMappingController = require('../controllers/partnerMappingController');

// Delivery partners riders can be mapped to.
router.get('/', partnerMappingController.listPartners);

module.exports = router;
