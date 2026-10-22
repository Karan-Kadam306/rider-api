
const crypto = require("crypto");
const { pool } = require("../db");

const bikeRepository = require("../repositories/bikeAssignmentRepository");
const idempotencyRepository = require("../repositories/idempotencyRepository");

function createError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function createRequestHash(bikeId, riderId) {
    const request = JSON.stringify({
        bikeId: String(bikeId),
        riderId: String(riderId)
    });

    return crypto.createHash("sha256")
        .update(request)
        .digest("hex");
}

function replaySavedResult(saved, requestHash) {
    if (saved.request_hash !== requestHash) {
        throw createError(
            "Idempotency key reused with different request data",
            422
        );
    }

    if (saved.status !== "done") {
        throw createError("Request is still processing", 409);
    }

    return {
        statusCode: saved.response_status,
        body: saved.response_body,
        replayed: true
    };
}

async function findSavedResult(clientId, key) {
    const result = await pool.query(
        `SELECT request_hash, status, response_status, response_body
         FROM idempotency_keys
         WHERE client_id = $1 AND key = $2`,
        [clientId, key]
    );

    return result.rows[0] ?? null;
}

async function assignBike({
    bikeId,
    riderId,
    clientId,
    idempotencyKey
}) {
    if (
        bikeId == null ||
        !String(bikeId).trim() ||
        riderId == null ||
        !String(riderId).trim() ||
        !clientId ||
        !idempotencyKey
    ) {
        throw createError(
            "bikeId, riderId, clientId and idempotencyKey are required",
            400
        );
    }

    const requestHash = createRequestHash(bikeId, riderId);
    const client = await pool.connect();

    let transactionStarted = false;
    let connectionReleased = false;

    try {
        await client.query("BEGIN");
        transactionStarted = true;

        const saved = await idempotencyRepository.findByKey(
            client,
            clientId,
            idempotencyKey
        );

        if (saved) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return replaySavedResult(saved, requestHash);
        }

        await idempotencyRepository.insertKey(
            client,
            clientId,
            idempotencyKey,
            requestHash
        );

        // Lock the bike while checking and assigning it.
        const bike = await bikeRepository.findBikeForUpdate(
            client,
            bikeId
        );

        if (!bike) {
            throw createError("Bike not found", 404);
        }

        if (bike.status !== "Available") {
            throw createError("Bike is not available", 409);
        }

        const riderResult = await client.query(
            `SELECT rider_id
             FROM riders
             WHERE rider_id = $1`,
            [riderId]
        );

        if (riderResult.rowCount === 0) {
            throw createError("Rider not found", 404);
        }

        const assignment = await bikeRepository.createAssignment(
            client,
            bikeId,
            riderId
        );

        await bikeRepository.markBikeAssigned(client, bikeId);

        const responseBody = {
            message: "Bike assigned successfully",
            assignment
        };

        // Save the original response in the same transaction.
        await idempotencyRepository.saveResult(
            client,
            clientId,
            idempotencyKey,
            201,
            responseBody
        );

        await client.query("COMMIT");
        transactionStarted = false;

        return {
            statusCode: 201,
            body: responseBody,
            replayed: false
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

        // A duplicate idempotency key must be resolved after rollback.
        if (
            !connectionReleased &&
            error.code === "23505" &&
            error.constraint === "idempotency_keys_pkey"
        ) {
            const saved = await findSavedResult(
                clientId,
                idempotencyKey
            );

            if (saved) {
                return replaySavedResult(saved, requestHash);
            }

            throw createError(
                "Unable to resolve the previous request. Retry with the same key.",
                503
            );
        }

        throw error;
    } finally {
        if (!connectionReleased) {
            client.release();
        }
    }
}

module.exports = { assignBike };
