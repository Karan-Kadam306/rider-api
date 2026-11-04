const USER_COLUMNS = `user_id::int AS user_id,
                email,
                name,
                role,
                is_active`;

// Extra columns shown on the Users page.
const MANAGED_USER_COLUMNS = `${USER_COLUMNS},
                created_at,
                last_login_at`;

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

// Includes the password hash. forUpdate locks the row until the transaction ends.
async function findById(client, { userId, forUpdate = false }) {
    const result = await client.query(
        `SELECT ${MANAGED_USER_COLUMNS}, password_hash
         FROM users
         WHERE user_id = $1
         ${forUpdate ? 'FOR UPDATE' : ''}`,
        [userId]
    );

    return result.rows[0] ?? null;
}

// status: 'active' or 'inactive'. search matches name or email.
async function listUsers(client, { status, search }) {
    const result = await client.query(
        `SELECT ${MANAGED_USER_COLUMNS}
         FROM users
         WHERE is_active = $1
           AND ($2::text IS NULL OR name ILIKE $2 OR email ILIKE $2)
         ORDER BY lower(name), user_id`,
        [status === 'active', search ? `%${search}%` : null]
    );

    return result.rows;
}

async function countByStatus(client) {
    const result = await client.query(
        `SELECT count(*) FILTER (WHERE is_active)::int AS active,
                count(*) FILTER (WHERE NOT is_active)::int AS inactive
         FROM users`
    );

    return result.rows[0];
}

// Locks every active admin row, so two admins cannot remove the last admin at the same time.
async function lockActiveAdminIds(client) {
    const result = await client.query(
        `SELECT user_id::int AS user_id
         FROM users
         WHERE role = 'admin' AND is_active
         ORDER BY user_id
         FOR UPDATE`
    );

    return result.rows.map(row => row.user_id);
}

async function insertUser(client, { email, name, passwordHash, role }) {
    const result = await client.query(
        `INSERT INTO users (email, name, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING ${MANAGED_USER_COLUMNS}`,
        [email, name, passwordHash, role]
    );

    return result.rows[0];
}

async function updateUser(client, { userId, name, role, isActive }) {
    const result = await client.query(
        `UPDATE users
         SET name = $2, role = $3, is_active = $4
         WHERE user_id = $1
         RETURNING ${MANAGED_USER_COLUMNS}`,
        [userId, name, role, isActive]
    );

    return result.rows[0];
}

async function updatePassword(client, { userId, passwordHash }) {
    await client.query('UPDATE users SET password_hash = $2 WHERE user_id = $1', [userId, passwordHash]);
}

async function recordLogin(client, { userId }) {
    await client.query('UPDATE users SET last_login_at = now() WHERE user_id = $1', [userId]);
}

module.exports = {
    findByEmail,
    findById,
    listUsers,
    countByStatus,
    lockActiveAdminIds,
    insertUser,
    updateUser,
    updatePassword,
    recordLogin
};
