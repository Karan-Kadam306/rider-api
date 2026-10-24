const express = require("express");
const router = express.Router();

const bikeController = require("../controllers/bikeController");

router.post("/", bikeController.createBike);

router.get("/", bikeController.getBikes);

router.get("/:bikeId", bikeController.getBike);

router.patch("/:bikeId/status", bikeController.updateBikeStatus);

module.exports = router;
