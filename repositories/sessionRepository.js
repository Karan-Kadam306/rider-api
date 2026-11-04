async function insertSession(client, { tokenHash, userId, expiresAt }) {
    await client.query(
        `INSERT INTO sessions (token_hash, user_id, expires_at)
         VALUES ($1, $2, $3)`,
        [tokenHash, userId, expiresAt]
    );
}

// The signed-in user, or null if the session is unknown, expired or the user is inactive.
async function findActiveUser(client, { tokenHash }) {
    const result = await client.query(
        `SELECT users.user_id::int AS user_id,
                users.email,
                users.name,
                users.role,
                users.is_active
         FROM sessions
         JOIN users ON users.user_id = sessions.user_id
         WHERE sessions.token_hash = $1
           AND sessions.expires_at > now()
           AND users.is_active`,
        [tokenHash]
    );

    return result.rows[0] ?? null;
}

async function deleteSession(client, { tokenHash }) {
    await client.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

// Housekeeping on sign-in, so old sessions do not pile up.
async function deleteExpiredForUser(client, { userId }) {
    await client.query('DELETE FROM sessions WHERE user_id = $1 AND expires_at <= now()', [userId]);
}

// Signs the user out everywhere, except the session given in exceptTokenHash (if any).
async function deleteAllForUser(client, { userId, exceptTokenHash = null }) {
    await client.query(
        'DELETE FROM sessions WHERE user_id = $1 AND token_hash IS DISTINCT FROM $2',
        [userId, exceptTokenHash]
    );
}

module.exports = {
    insertSession,
    deleteAllForUser,
    findActiveUser,
    deleteSession,
    deleteExpiredForUser
};
