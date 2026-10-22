const express = require("express");
const router = express.Router();

const bikeAssignmentController = require("../controllers/bikeAssignmentController");

router.post(
    "/",
    bikeAssignmentController.assignBike
);

module.exports = router;
