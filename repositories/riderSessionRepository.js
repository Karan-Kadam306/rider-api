async function insertSession(client, { tokenHash, phone, expiresAt, deviceInfo, ipAddress }) {
    await client.query(
        `INSERT INTO rider_sessions (token_hash, phone, expires_at, device_info, ip_address)
         VALUES ($1, $2, $3, $4, $5)`,
        [tokenHash, phone, expiresAt, deviceInfo, ipAddress]
    );
}

// The session, or null if it is unknown, expired or signed out.
async function findActive(client, { tokenHash }) {
    const result = await client.query(
        `SELECT phone
         FROM rider_sessions
         WHERE token_hash = $1
           AND expires_at > now()
           AND revoked_at IS NULL`,
        [tokenHash]
    );

    return result.rows[0] ?? null;
}

// Keeps a session in use alive for another sessionDays. Written at most once an hour per session.
async function extend(client, { tokenHash, sessionDays }) {
    await client.query(
        `UPDATE rider_sessions
         SET last_used_at = now(),
             expires_at = now() + make_interval(days => $2)
         WHERE token_hash = $1
           AND last_used_at < now() - interval '1 hour'`,
        [tokenHash, sessionDays]
    );
}

async function revoke(client, { tokenHash }) {
    await client.query(
        'UPDATE rider_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
        [tokenHash]
    );
}

// Signs the phone out of the app everywhere, e.g. when the rider is terminated.
async function revokeAllForPhone(client, { phone }) {
    await client.query(
        'UPDATE rider_sessions SET revoked_at = now() WHERE phone = $1 AND revoked_at IS NULL',
        [phone]
    );
}

module.exports = {
    insertSession,
    findActive,
    extend,
    revoke,
    revokeAllForPhone
};
