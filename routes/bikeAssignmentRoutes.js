const express = require("express");
const router = express.Router();

// Import the bikeAssignmentController to handle requests related to bike assignments.
const bikeAssignmentController = require("../controllers/bikeAssignmentController");

// Define the route for assigning a bike to a rider.
router.post(
    "/",
    bikeAssignmentController.assignBike
);

module.exports = router;
