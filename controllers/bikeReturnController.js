const bikeReturnService = require("../services/bikeReturnService");

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
