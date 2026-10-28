// Recreates the rider_test database from db/schema.sql.
// Usage: npm run db:test:setup
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function setupTestDb() {
    const testUrl = new URL(process.env.TEST_DATABASE_URL);
    const testDbName = testUrl.pathname.slice(1);

    // Never drop a database that is not clearly a test database.
    if (!testDbName.endsWith('_test')) {
        throw new Error(`Refusing to reset "${testDbName}": name must end with _test`);
    }

    // Connect to the default database to drop and create the test one.
    const adminUrl = new URL(testUrl);
    adminUrl.pathname = '/postgres';

    const admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${testDbName} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${testDbName}`);
    await admin.end();

    // pg_dump adds psql-only lines (starting with \), so remove them.
    const schema = fs
        .readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8')
        .split('\n')
        .filter(line => !line.startsWith('\\'))
        .join('\n');

    const client = new Client({ connectionString: testUrl.toString() });
    await client.connect();
    await client.query(schema);
    await client.end();

    console.log(`Test database "${testDbName}" is ready.`);
}

setupTestDb().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
