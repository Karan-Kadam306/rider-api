// Codes sent in the last hour to this phone and from this IP, for the send limits.
async function countRecentSends(client, { phone, ipAddress }) {
    const result = await client.query(
        `SELECT
            count(*) FILTER (WHERE phone = $1)::int AS phone_sends,
            min(created_at) FILTER (WHERE phone = $1) AS phone_oldest,
            max(created_at) FILTER (WHERE phone = $1) AS phone_latest,
            count(*) FILTER (WHERE ip_address = $2)::int AS ip_sends,
            min(created_at) FILTER (WHERE ip_address = $2) AS ip_oldest
         FROM rider_otps
         WHERE (phone = $1 OR ip_address = $2)
           AND created_at > now() - interval '1 hour'`,
        [phone, ipAddress]
    );

    return result.rows[0];
}

// A new code replaces the phone's earlier ones. Old rows are dropped so the table stays small.
async function insertOtp(client, { phone, codeHash, expiresAt, ipAddress }) {
    await client.query(
        `UPDATE rider_otps SET expires_at = now()
         WHERE phone = $1 AND consumed_at IS NULL AND expires_at > now()`,
        [phone]
    );
    await client.query(
        `INSERT INTO rider_otps (phone, code_hash, expires_at, ip_address)
         VALUES ($1, $2, $3, $4)`,
        [phone, codeHash, expiresAt, ipAddress]
    );
    await client.query(`DELETE FROM rider_otps WHERE created_at < now() - interval '1 day'`);
}

// The phone's latest unused code, locked so wrong attempts are counted one at a time.
async function findLatestForUpdate(client, { phone }) {
    const result = await client.query(
        `SELECT otp_id, code_hash, attempts, expires_at <= now() AS is_expired
         FROM rider_otps
         WHERE phone = $1 AND consumed_at IS NULL
         ORDER BY created_at DESC, otp_id DESC
         LIMIT 1
         FOR UPDATE`,
        [phone]
    );

    return result.rows[0] ?? null;
}

async function addAttempt(client, { otpId }) {
    const result = await client.query(
        'UPDATE rider_otps SET attempts = attempts + 1 WHERE otp_id = $1 RETURNING attempts',
        [otpId]
    );

    return result.rows[0].attempts;
}

async function markConsumed(client, { otpId }) {
    await client.query('UPDATE rider_otps SET consumed_at = now() WHERE otp_id = $1', [otpId]);
}

module.exports = {
    countRecentSends,
    insertOtp,
    findLatestForUpdate,
    addAttempt,
    markConsumed
};
