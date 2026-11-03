// Applies the SQL files in db/migrations that this database has not run yet, in name order.
// Each file runs in one transaction together with its record in schema_migrations.
// Usage: npm run db:migrate                 (DATABASE_URL)
//        NODE_ENV=test npm run db:migrate   (TEST_DATABASE_URL)
//        npm run db:migrate -- --baseline   record every file as applied without running it
//                                           (once, for a database that was migrated by hand)
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function migrationFiles() {
    return fs.readdirSync(MIGRATIONS_DIR).filter(name => name.endsWith('.sql')).sort();
}

// The runner owns the transaction, so the file's own BEGIN; / COMMIT; lines are dropped.
function readMigration(name) {
    return fs
        .readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8')
        .split('\n')
        .filter(line => !/^\s*(BEGIN|COMMIT)\s*;\s*$/i.test(line))
        .join('\n');
}

async function ensureMigrationsTable(client) {
    await client.query(
        `CREATE TABLE IF NOT EXISTS public.schema_migrations (
            name text PRIMARY KEY,
            applied_at timestamp with time zone DEFAULT now() NOT NULL
        )`
    );
}

async function migrate({ baseline }) {
    const client = await pool.connect();

    try {
        const { rows: [{ db }] } = await client.query('SELECT current_database() AS db');
        await ensureMigrationsTable(client);

        const { rows } = await client.query('SELECT name FROM public.schema_migrations');
        const applied = new Set(rows.map(row => row.name));
        const pending = migrationFiles().filter(name => !applied.has(name));

        if (pending.length === 0) {
            console.log(`"${db}" is up to date (${applied.size} migration(s) applied).`);
            return;
        }

        for (const name of pending) {
            await client.query('BEGIN');

            try {
                if (!baseline) {
                    await client.query(readMigration(name));
                }

                await client.query('INSERT INTO public.schema_migrations (name) VALUES ($1)', [name]);
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                throw new Error(`${name} failed and was rolled back: ${error.message}`);
            }

            console.log(`${baseline ? 'Recorded' : 'Applied'} ${name} on "${db}"`);
        }
    } finally {
        client.release();
        await pool.end();
    }
}

migrate({ baseline: process.argv.includes('--baseline') }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
