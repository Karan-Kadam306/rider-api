const USER_COLUMNS = `user_id::int AS user_id,
                email,
                name,
                role,
                is_active`;

// Includes the password hash; only the sign-in check needs it.
async function findByEmail(client, { email }) {
    const result = await client.query(
        `SELECT ${USER_COLUMNS}, password_hash
         FROM users
         WHERE email = $1`,
        [email]
    );

    return result.rows[0] ?? null;
}

async function insertUser(client, { email, name, passwordHash, role }) {
    const result = await client.query(
        `INSERT INTO users (email, name, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING ${USER_COLUMNS}`,
        [email, name, passwordHash, role]
    );

    return result.rows[0];
}

async function recordLogin(client, { userId }) {
    await client.query('UPDATE users SET last_login_at = now() WHERE user_id = $1', [userId]);
}

module.exports = {
    findByEmail,
    insertUser,
    recordLogin
};
