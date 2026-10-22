
const express = require("express");
const router = express.Router();

const bikeReturnController = require("../controllers/bikeReturnController");

router.post(
    "/:bikeId/return",
    bikeReturnController.returnBike
);

module.exports = router;
