const bikeReturnService = require("../services/bikeReturnService");

// POST /api/bikes/:bikeId/return
// Return a bike that is currently assigned to a rider.
async function returnBike(req, res, next) {
    try {
        const result = await bikeReturnService.returnBike(
            req.params.bikeId
        );

        return res.status(200).json(result);
    } catch (error){
        next(error);
    }
}

module.exports = { returnBike };
