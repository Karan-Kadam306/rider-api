const express = require('express');
const router = express.Router();

const {
    getRider,
    getRiders,
    createRider,
    updateRider,
    terminateRider,
    getRiderSummary
} = require('../controllers/riderController');
const { validateRiderQuery } = require('../middleware/validateRiderQuery');
const { validateCreateRider } = require('../middleware/validateCreateRider');
const { validateUpdateRider } = require('../middleware/validateUpdateRider');

// Define the route for fetching a list of riders with optional query parameters for filtering and pagination.
router.get('/', validateRiderQuery, getRiders);

// Define the route for creating a new rider with validation of the request body.
router.post('/', validateCreateRider, createRider);

// Define the route for fetching a summary of riders, which may include statistics or aggregated data.
router.get('/summary', getRiderSummary);

// Define the route for fetching details of a specific rider by their ID.
router.get('/:riderId', getRider);

// Define the route for updating an existing rider's information with validation of the request body.
router.put('/:riderId', validateUpdateRider, updateRider);

// Define the route for terminating a rider, which may involve deactivating their account or marking them as inactive in the system.
router.delete('/:riderId', terminateRider);

module.exports = router;
