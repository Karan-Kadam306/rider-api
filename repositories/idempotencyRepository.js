// Repository functions for managing idempotency keys in the database. These functions help ensure that repeated requests with the same idempotency key return the same result, preventing duplicate processing.
async function insertKey(client, clientId, key, requestHash) {
    await client.query(
        `INSERT INTO idempotency_keys
            (client_id, key, request_hash, status)
         VALUES ($1, $2, $3, 'processing')`,
        [clientId, key, requestHash]
    );
}

// Find an idempotency key record by client ID and key. Returns null if not found.
async function findByKey(client, clientId, key) {
    const result = await client.query(
        `SELECT
            request_hash,
            status,
            response_status,
            response_body
        FROM idempotency_keys
        WHERE client_id = $1
            AND key = $2`,
        [clientId, key]
    );

    return result.rows[0] ?? null;
}

// Save the response of a completed request to the idempotency key record. This allows future requests with the same key to return the same response.
async function saveResult(
    client,
    clientId,
    key,
    responseStatus,
    responseBody
) {
    const result = await client.query(
        `UPDATE idempotency_keys
         SET status = 'done',
             response_status = $3,
             response_body = $4
         WHERE client_id = $1
           AND key = $2`,
        [
            clientId,
            key,
            responseStatus,
            JSON.stringify(responseBody)
        ]
    );

    if (result.rowCount !== 1) {
        throw new Error("Failed to save idempotency response");
    }
}

module.exports = {
    findByKey,
    insertKey,
    saveResult
};
