const express = require("express");
const router = express.Router();

// Import the bikeReturnController to handle requests related to bike returns.
const bikeReturnController = require("../controllers/bikeReturnController");

// Define the route for returning a bike that is currently assigned to a rider.
router.post(
    "/:bikeId/return",
    bikeReturnController.returnBike
);

module.exports = router;
