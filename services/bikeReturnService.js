const { pool } = require('../db');
const AppError = require('../errors/AppError');
const bikeRepository = require("../repositories/bikeAssignmentRepository");

// Returns a bike to the system, ensuring that the bikeId is valid and handling database transactions safely.
async function returnBike(bikeId) {
    if(
        bikeId == null ||
        !String(bikeId).trim() ||
        !Number.isSafeInteger(Number(bikeId)) ||
        Number(bikeId) <= 0
    ) {
        throw new AppError("A valid bikeId is Required", 400);
    }

    const client = await pool.connect();
    let transactionStarted = false;
    let connectionReleased = false;

    // Start a database transaction to ensure that the bike return operation is atomic and can be rolled back in case of errors.
    try {
        await client.query("BEGIN");
        transactionStarted = true;

        const assignment = await bikeRepository.returnBike(
            client,
            bikeId
        );

        await client.query("COMMIT");
        transactionStarted = false;

        return {
            message: "Bike returned Successfully",
            assignment
        };
    } catch (error) {
        if (transactionStarted) {
            try {
                await client.query("ROLLBACK");
                transactionStarted = false;
            } catch (rollbackError) {
                client.release(rollbackError);
                connectionReleased = true;
            }
        }
        throw error;
    } finally {
        if (!connectionReleased){
            client.release();
        }
    }
}

module.exports = { returnBike };
