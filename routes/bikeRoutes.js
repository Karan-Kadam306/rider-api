const express = require("express");
const router = express.Router();

const bikeController = require("../controllers/bikeController");

// Define the route for creating a new bike.
router.post("/", bikeController.createBike);

// Define the route for fetching all bikes.
router.get("/", bikeController.getBikes);

// Must stay above /:bikeId so "summary" is not read as a bike ID.
// Define the route for fetching a summary of bikes by status.
router.get("/summary", bikeController.getBikeSummary);

// Define the route for fetching details of a specific bike by its ID.
router.get("/:bikeId", bikeController.getBike);

// Define the route for updating the status of a specific bike.
router.patch("/:bikeId/status", bikeController.updateBikeStatus);

module.exports = router;
