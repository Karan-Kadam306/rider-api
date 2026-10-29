const bikeAssignmentService = require("../services/bikeAssignmentService");
// POST /api/bikes/assign
// Assign a bike to a rider.
async function assignBike(req, res, next) {
    try {
        const result = await bikeAssignmentService.assignBike({
            bikeId: req.body.bikeId,
            riderId: req.body.riderId,

            clientId: req.body.clientId,

            idempotencyKey: req.get("Idempotency-Key")
        });

        if (result.replayed) {
            res.set("Idempotency-Replayed", "true");
        }

        return res.status(result.statusCode).json(result.body);
    } catch (error) {
        next(error);
    }
}

module.exports = { assignBike };
