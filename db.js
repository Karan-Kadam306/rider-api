const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    // Set the timezone to Asia/Kolkata for all queries.
    options: '-c timezone=Asia/Kolkata'
});

module.exports = { pool };
