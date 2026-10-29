const express = require("express");
const router = express.Router();

const bikeController = require("../controllers/bikeController");

router.post("/", bikeController.createBike);

router.get("/", bikeController.getBikes);

// Must stay above /:bikeId so "summary" is not read as a bike ID.
router.get("/summary", bikeController.getBikeSummary);

router.get("/:bikeId", bikeController.getBike);

router.patch("/:bikeId/status", bikeController.updateBikeStatus);

module.exports = router;
