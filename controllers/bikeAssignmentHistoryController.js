
const bikeAssignmentHistoryService = require("../services/bikeAssignmentHistoryService");

// Get the assignment history of a specific bike.
async function getBikeAssignmentHistory(req, res, next) {
    try {
        const result =
            await bikeAssignmentHistoryService.getBikeAssignmentHistory(
                req.params.bikeId,
                req.query.page ?? 1,
                req.query.limit ?? 10
            );

        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

module.exports = { getBikeAssignmentHistory };
