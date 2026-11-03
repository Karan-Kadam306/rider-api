// Read-only data consistency check. Reports problems; never changes anything.
// Usage: npm run db:check            (DATABASE_URL)
//        NODE_ENV=test npm run db:check (TEST_DATABASE_URL)
const { pool } = require('../db');

// Each check returns the offending rows; an empty result means the check passed.
const CHECKS = [
    {
        name: 'Bike with more than one open assignment',
        sql: `SELECT bike_id, COUNT(*)::int AS open_assignments
              FROM bike_assignments WHERE returned_at IS NULL
              GROUP BY bike_id HAVING COUNT(*) > 1`
    },
    {
        name: 'Rider with more than one open assignment',
        sql: `SELECT rider_id, COUNT(*)::int AS open_assignments
              FROM bike_assignments WHERE returned_at IS NULL
              GROUP BY rider_id HAVING COUNT(*) > 1`
    },
    {
        name: 'Bike marked Assigned without an open assignment',
        sql: `SELECT b.bike_id, b.chassis_number
              FROM bikes b
              WHERE b.status = 'Assigned'
                AND NOT EXISTS (SELECT 1 FROM bike_assignments ba
                                WHERE ba.bike_id = b.bike_id AND ba.returned_at IS NULL)`
    },
    {
        name: 'Bike with an open assignment but not marked Assigned',
        sql: `SELECT b.bike_id, b.chassis_number, b.status
              FROM bikes b
              JOIN bike_assignments ba ON ba.bike_id = b.bike_id AND ba.returned_at IS NULL
              WHERE b.status <> 'Assigned'`
    },
    {
        name: 'Assignment returned before it was assigned',
        sql: `SELECT assignment_id, bike_id, rider_id, assigned_at, returned_at
              FROM bike_assignments WHERE returned_at <= assigned_at`
    },
    {
        name: 'Terminated rider without a termination date',
        sql: `SELECT rider_id, name FROM riders
              WHERE status = 'Terminated' AND terminated_on IS NULL`
    },
    {
        name: 'Rider with a termination date who is not Terminated',
        sql: `SELECT rider_id, name, status, terminated_on FROM riders
              WHERE status <> 'Terminated' AND terminated_on IS NOT NULL`
    },
    {
        name: 'Terminated rider still holding a bike',
        sql: `SELECT r.rider_id, ba.bike_id, ba.assigned_at
              FROM riders r
              JOIN bike_assignments ba ON ba.rider_id = r.rider_id AND ba.returned_at IS NULL
              WHERE r.status = 'Terminated'`
    },
    {
        name: 'Validated Daily KM without a bike or rider',
        sql: `SELECT km_record_id, reported_vin, usage_date, bike_id, rider_id
              FROM daily_km_records
              WHERE status = 'Validated' AND (bike_id IS NULL OR rider_id IS NULL)`
    },
    {
        name: 'Overlapping inactive periods for a rider',
        sql: `SELECT a.rider_id, a.inactive_period_id AS period_a, b.inactive_period_id AS period_b
              FROM rider_inactive_periods a
              JOIN rider_inactive_periods b
                ON a.rider_id = b.rider_id
               AND a.inactive_period_id < b.inactive_period_id
               AND a.start_date <= b.end_date AND b.start_date <= a.end_date`
    },
    {
        name: 'Closed week whose total does not match its saved bills',
        sql: `SELECT TO_CHAR(c.week_start, 'YYYY-MM-DD') AS week_start,
                     c.total_amount::float8 AS closed_total,
                     COALESCE(SUM(s.total_amount), 0)::float8 AS bills_total
              FROM billing_week_closures c
              LEFT JOIN billing_week_snapshots s ON s.week_start = c.week_start
              GROUP BY c.week_start, c.total_amount
              HAVING c.total_amount <> COALESCE(SUM(s.total_amount), 0)`
    },
    {
        name: 'Payout whose latest run total does not match its riders',
        sql: `SELECT TO_CHAR(r.week_start, 'YYYY-MM-DD') AS week_start,
                     r.total_amount::float8 AS run_total,
                     COALESCE((SELECT SUM(total_amount) FROM payout_items i
                               WHERE i.week_start = r.week_start), 0)::float8 AS riders_total
              FROM payout_runs r
              WHERE r.run_number = (SELECT MAX(run_number) FROM payout_runs x WHERE x.week_start = r.week_start)
                AND r.total_amount <> COALESCE((SELECT SUM(total_amount) FROM payout_items i
                                                WHERE i.week_start = r.week_start), 0)`
    }
];

async function checkData() {
    const client = await pool.connect();
    let problems = 0;

    try {
        // The database itself refuses any write inside a read-only transaction.
        await client.query('BEGIN READ ONLY');

        const { rows: [{ db }] } = await client.query('SELECT current_database() AS db');
        console.log(`Checking database "${db}" (read-only)\n`);

        for (const check of CHECKS) {
            const { rows } = await client.query(check.sql);

            if (rows.length === 0) {
                console.log(`  OK    ${check.name}`);
                continue;
            }

            problems += rows.length;
            console.log(`  FAIL  ${check.name} (${rows.length})`);
            console.table(rows.slice(0, 20));

            if (rows.length > 20) {
                console.log(`        …and ${rows.length - 20} more`);
            }
        }

        await client.query('ROLLBACK');
    } finally {
        client.release();
        await pool.end();
    }

    console.log(problems ? `\n${problems} problem(s) found.` : '\nAll checks passed.');
    process.exitCode = problems ? 1 : 0;
}

checkData().catch(error => {
    console.error(error.message);
    process.exitCode = 2;
});
