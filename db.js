require('dotenv').config({ quiet: true });

const { Pool } = require('pg');

// Tests use their own database so real data is never touched.
const connectionString = process.env.NODE_ENV === 'test'
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL;

const pool = new Pool({
    connectionString,
    max: 10,
    // Set the timezone to Asia/Kolkata for all queries.
    options: '-c timezone=Asia/Kolkata'
});

module.exports = { pool };
