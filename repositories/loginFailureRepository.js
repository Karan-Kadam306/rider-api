// Failures inside the window for this email and for this IP, and when the oldest of each happened.
async function countRecent(client, { email, ipAddress, windowMinutes }) {
    const result = await client.query(
        `SELECT
            count(*) FILTER (WHERE email = $1)::int AS email_failures,
            min(failed_at) FILTER (WHERE email = $1) AS email_oldest,
            count(*) FILTER (WHERE ip_address = $2)::int AS ip_failures,
            min(failed_at) FILTER (WHERE ip_address = $2) AS ip_oldest
         FROM login_failures
         WHERE (email = $1 OR ip_address = $2)
           AND failed_at > now() - make_interval(mins => $3)`,
        [email, ipAddress, windowMinutes]
    );

    return result.rows[0];
}

// Records a failure and drops old rows so the table stays small.
async function insertFailure(client, { email, ipAddress }) {
    await client.query(
        'INSERT INTO login_failures (email, ip_address) VALUES ($1, $2)',
        [email, ipAddress]
    );
    await client.query(`DELETE FROM login_failures WHERE failed_at < now() - interval '1 day'`);
}

async function deleteForEmail(client, { email }) {
    await client.query('DELETE FROM login_failures WHERE email = $1', [email]);
}

module.exports = {
    countRecent,
    insertFailure,
    deleteForEmail
};
