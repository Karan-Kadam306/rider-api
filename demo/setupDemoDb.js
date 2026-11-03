// Recreates the rider_demo database (schema + demo/seed.sql) for the manual test.
// Usage: npm run demo:setup        Safe to run again: it starts over from the seed.
// It uses DATABASE_URL's server and login, with the database name changed to rider_demo.
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DEMO_DB = 'rider_demo';

async function setupDemoDb() {
    const demoUrl = new URL(process.env.DATABASE_URL);
    demoUrl.pathname = `/${DEMO_DB}`;

    const adminUrl = new URL(demoUrl);
    adminUrl.pathname = '/postgres';

    const admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${DEMO_DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DEMO_DB}`);
    await admin.end();

    // pg_dump adds psql-only lines (starting with \), so remove them.
    const schema = fs
        .readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8')
        .split('\n')
        .filter(line => !line.startsWith('\\'))
        .join('\n');

    const migrations = fs
        .readdirSync(path.join(__dirname, '..', 'db', 'migrations'))
        .filter(name => name.endsWith('.sql'));

    const client = new Client({ connectionString: demoUrl.toString() });
    await client.connect();

    try {
        await client.query(schema);
        // pg_dump empties the search_path; restore it for the seed.
        await client.query('SET search_path TO public');
        await client.query(
            `CREATE TABLE schema_migrations (
                name text PRIMARY KEY,
                applied_at timestamp with time zone DEFAULT now() NOT NULL
            )`
        );
        await client.query('INSERT INTO schema_migrations (name) SELECT unnest($1::text[])', [migrations]);
        await client.query(fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8'));
    } finally {
        await client.end();
    }

    console.log(`Demo database "${DEMO_DB}" is ready with the demo riders, bikes and assignments.`);
}

setupDemoDb().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
