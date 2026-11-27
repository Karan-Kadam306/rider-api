// Onboarding payment orders (deposit, first prepaid pack) and the deposits riders hold with us.

// An open order past its expiry reads as Expired, so nothing has to sweep old orders.
const PAYMENT_COLUMNS = `rp.payment_id::int AS payment_id,
                rp.order_id,
                rp.application_id::int AS application_id,
                rp.rider_id,
                rp.purpose,
                rp.amount::float8 AS amount,
                rp.prepaid_pack_id::int AS prepaid_pack_id,
                CASE WHEN rp.status = 'Created' AND rp.expires_at <= now() THEN 'Expired' ELSE rp.status END AS status,
                rp.idempotency_key,
                rp.expires_at,
                rp.method,
                rp.gateway_payment_id,
                rp.manual_reference,
                marker.name AS marked_by,
                rp.note,
                rp.failure_reason,
                rp.paid_at,
                rp.created_at`;

const FROM_PAYMENTS = `FROM rider_payments rp
         LEFT JOIN users marker ON marker.user_id = rp.marked_by_user_id`;

async function findByOrderId(client, { orderId, forUpdate = false }) {
    const result = await client.query(
        `SELECT ${PAYMENT_COLUMNS}
         ${FROM_PAYMENTS}
         WHERE rp.order_id = $1
         ${forUpdate ? 'FOR UPDATE OF rp' : ''}`,
        [orderId]
    );

    return result.rows[0] ?? null;
}

async function findByIdempotencyKey(client, { riderId, idempotencyKey }) {
    const result = await client.query(
        `SELECT ${PAYMENT_COLUMNS}
         ${FROM_PAYMENTS}
         WHERE rp.rider_id = $1 AND rp.idempotency_key = $2`,
        [riderId, idempotencyKey]
    );

    return result.rows[0] ?? null;
}

// Every order for an application, oldest first.
async function findByApplication(client, { applicationId }) {
    const result = await client.query(
        `SELECT ${PAYMENT_COLUMNS}
         ${FROM_PAYMENTS}
         WHERE rp.application_id = $1
         ORDER BY rp.created_at, rp.payment_id`,
        [applicationId]
    );

    return result.rows;
}

// Frees the "one open order" slot when the open order has run out of time.
async function expireStaleOrder(client, { applicationId, purpose }) {
    await client.query(
        `UPDATE rider_payments SET status = 'Expired', updated_at = now()
         WHERE application_id = $1 AND purpose = $2 AND status = 'Created' AND expires_at <= now()`,
        [applicationId, purpose]
    );
}

async function insertOrder(client, { orderId, applicationId, riderId, purpose, amount, depositId, packId, idempotencyKey, validMinutes }) {
    const result = await client.query(
        `INSERT INTO rider_payments
            (order_id, application_id, rider_id, purpose, amount, deposit_id, prepaid_pack_id, idempotency_key, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(mins => $9))
         RETURNING payment_id::int AS payment_id`,
        [orderId, applicationId, riderId, purpose, amount, depositId, packId, idempotencyKey, validMinutes]
    );

    return result.rows[0].payment_id;
}

async function markPaidByGateway(client, { paymentId, gatewayPaymentId }) {
    await client.query(
        `UPDATE rider_payments
         SET status = 'Paid', method = 'Gateway', gateway_payment_id = $2, failure_reason = NULL,
             paid_at = now(), updated_at = now()
         WHERE payment_id = $1`,
        [paymentId, gatewayPaymentId]
    );
}

async function markPaidManually(client, { paymentId, reference, note, userId }) {
    await client.query(
        `UPDATE rider_payments
         SET status = 'Paid', method = 'Manual', manual_reference = $2, note = $3, marked_by_user_id = $4,
             failure_reason = NULL, paid_at = now(), updated_at = now()
         WHERE payment_id = $1`,
        [paymentId, reference, note, userId]
    );
}

async function markFailed(client, { paymentId, reason }) {
    await client.query(
        `UPDATE rider_payments SET status = 'Failed', failure_reason = $2, updated_at = now()
         WHERE payment_id = $1`,
        [paymentId, reason]
    );
}

// True if the reference was already used for any payment, by hand or by the gateway.
async function referenceExists(client, { reference }) {
    const result = await client.query(
        `SELECT 1 FROM rider_payments WHERE manual_reference = $1 OR gateway_payment_id = $1 LIMIT 1`,
        [reference]
    );

    return result.rowCount > 0;
}

async function insertDeposit(client, { riderId, paymentId, amount }) {
    await client.query(
        `INSERT INTO rider_deposits (rider_id, payment_id, amount) VALUES ($1, $2, $3)`,
        [riderId, paymentId, amount]
    );
}

async function findDepositByRider(client, { riderId }) {
    const result = await client.query(
        `SELECT d.amount::float8 AS amount, d.status, d.held_since, rp.order_id,
                COALESCE(rp.gateway_payment_id, rp.manual_reference) AS reference
         FROM rider_deposits d
         JOIN rider_payments rp ON rp.payment_id = d.payment_id
         WHERE d.rider_id = $1`,
        [riderId]
    );

    return result.rows[0] ?? null;
}

module.exports = {
    findByOrderId,
    findByIdempotencyKey,
    findByApplication,
    expireStaleOrder,
    insertOrder,
    markPaidByGateway,
    markPaidManually,
    markFailed,
    referenceExists,
    insertDeposit,
    findDepositByRider
};
