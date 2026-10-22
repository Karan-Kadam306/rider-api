const { pool } = require('../db');
const bikeRepository = require("../repositories/bikeAssignmentRepository");

async function returnBike(bikeId) {
    if(
        bikeId == null || 
        !String(bikeId).trim() ||
        !Number.isSafeInteger(Number(bikeId)) || 
        Number(bikeId) <= 0
    ) {
        const error = new error("A valid bikeId is Required");
        error.statusCode = 400;
        throw error;
    }

    const client = await pool.connect();
    let transactionStarted = false;
    let connectionReleased = false;

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
