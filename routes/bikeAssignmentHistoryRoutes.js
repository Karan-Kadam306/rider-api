const express = require("express");
const router = express.Router();

const bikeAssignmentHistoryController = require(
    "../controllers/bikeAssignmentHistoryController"
);

router.get(
    "/:bikeId/assignments",
    bikeAssignmentHistoryController.getBikeAssignmentHistory
);

module.exports = router;
