const express = require("express");
const router = express.Router();

// Import the bikeAssignmentHistoryController to handle requests related to bike assignment history.
const bikeAssignmentHistoryController = require(
    "../controllers/bikeAssignmentHistoryController"
);

// Define the route for fetching the assignment history of a specific bike.
router.get(
    "/:bikeId/assignments",
    bikeAssignmentHistoryController.getBikeAssignmentHistory
);

module.exports = router;
