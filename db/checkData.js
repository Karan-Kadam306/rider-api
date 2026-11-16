// Read-only data consistency check. Reports problems; never changes anything.
// Usage: npm run db:check            (DATABASE_URL)
//        NODE_ENV=test npm run db:check (TEST_DATABASE_URL)
const { pool } = require('../db');
const { mappingCoversDate } = require('../repositories/partnerRepository');

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
    },
    {
        // Past mappings count too: a reassigned ID keeps its earlier earnings with the first rider.
        name: 'Matched earning whose rider was never mapped to that partner ID',
        sql: `SELECT pe.earning_id, p.name AS partner, pe.partner_rider_id, pe.rider_id,
                     TO_CHAR(pe.earning_date, 'YYYY-MM-DD') AS earning_date
              FROM partner_earnings pe
              JOIN partners p ON p.partner_id = pe.partner_id
              WHERE pe.status = 'Matched'
                AND NOT EXISTS (SELECT 1 FROM rider_partner_mappings m
                                WHERE m.partner_id = pe.partner_id
                                  AND m.partner_rider_id = pe.partner_rider_id
                                  AND m.rider_id = pe.rider_id)`
    },
    {
        // An import matches every row a mapping covers, and saving a mapping matches its covered pending rows,
        // so none should be left. Rows dated outside every mapping (before a reassigned ID moved) stay for review.
        name: 'Pending earning dated inside a mapping of its partner ID',
        sql: `SELECT pe.earning_id, p.name AS partner, pe.partner_rider_id, m.rider_id AS mapped_to,
                     TO_CHAR(pe.earning_date, 'YYYY-MM-DD') AS earning_date
              FROM partner_earnings pe
              JOIN partners p ON p.partner_id = pe.partner_id
              JOIN rider_partner_mappings m
                ON m.partner_id = pe.partner_id AND m.partner_rider_id = pe.partner_rider_id
              WHERE pe.status = 'Pending'
                AND ${mappingCoversDate('m', 'pe.earning_date')}`
    },
    {
        // An import matches a row to the rider who held the ID on its date. Rows a reviewer matched or moved
        // (reviewed_by is set) are a person's decision and may fall outside, so they are left out.
        name: 'Imported earning matched to a rider who did not hold the ID on its date',
        sql: `SELECT pe.earning_id, p.name AS partner, pe.partner_rider_id, pe.rider_id,
                     TO_CHAR(pe.earning_date, 'YYYY-MM-DD') AS earning_date
              FROM partner_earnings pe
              JOIN partners p ON p.partner_id = pe.partner_id
              WHERE pe.status = 'Matched'
                AND pe.reviewed_by IS NULL
                AND NOT EXISTS (SELECT 1 FROM rider_partner_mappings m
                                WHERE m.partner_id = pe.partner_id
                                  AND m.partner_rider_id = pe.partner_rider_id
                                  AND m.rider_id = pe.rider_id
                                  AND ${mappingCoversDate('m', 'pe.earning_date')})`
    },
    {
        // A failed earnings row blocks its week's payout, so a paid week should have none left open.
        // One here arrived after the payout (or before the block existed): fix or dismiss it, then re-run.
        name: 'Open earnings row error in a week that has been paid',
        sql: `SELECT re.error_id, re.import_id, p.name AS partner, re.partner_rider_id,
                     TO_CHAR(re.earning_date, 'YYYY-MM-DD') AS earning_date, re.error_message
              FROM import_row_errors re
              JOIN partners p ON p.partner_id = re.partner_id
              WHERE re.resolved_at IS NULL
                AND EXISTS (SELECT 1 FROM payout_runs r
                            WHERE r.week_start = date_trunc('week', re.earning_date::timestamp)::date)`
    },
    {
        // Weeks are paid in order once payouts have started, since a negative net is carried only from the
        // week before. A paid week after an unpaid one that had riding, earnings or a carried balance means
        // that balance was dropped. Pay the unpaid week, then re-run the later one.
        name: 'Unpaid week with activity before a paid week',
        sql: `WITH paid AS (SELECT DISTINCT week_start FROM payout_runs)
              SELECT TO_CHAR(p.week_start - 7, 'YYYY-MM-DD') AS unpaid_week,
                     TO_CHAR(p.week_start, 'YYYY-MM-DD') AS paid_week
              FROM paid p
              WHERE NOT EXISTS (SELECT 1 FROM paid x WHERE x.week_start = p.week_start - 7)
                AND EXISTS (SELECT 1 FROM paid x WHERE x.week_start < p.week_start - 7)
                AND (
                    EXISTS (SELECT 1 FROM bike_assignments ba
                            WHERE ba.assigned_at < p.week_start
                              AND (ba.returned_at IS NULL OR ba.returned_at > p.week_start - 7))
                    OR EXISTS (SELECT 1 FROM partner_earnings pe
                               WHERE pe.status = 'Matched'
                                 AND pe.earning_date BETWEEN p.week_start - 7 AND p.week_start - 1)
                    OR EXISTS (SELECT 1 FROM payout_items i
                               WHERE i.week_start = p.week_start - 14 AND i.net_payout < 0)
                )
              ORDER BY p.week_start`
    },
    {
        // Net is earnings − deductions − escalation charges + cleared balance, plus a carried
        // balance, which is never positive. Payouts from before partner earnings have neither value.
        name: 'Payout rider whose net is more than earnings minus deductions',
        sql: `SELECT TO_CHAR(week_start, 'YYYY-MM-DD') AS week_start, rider_id,
                     total_earnings::float8 AS earnings,
                     total_amount::float8 AS deductions,
                     net_payout::float8 AS net_payout
              FROM payout_items
              WHERE (total_earnings IS NULL) <> (net_payout IS NULL)
                 OR net_payout > total_earnings - total_amount
                                 - COALESCE(escalation_charges, 0) + COALESCE(balance_cleared, 0)`
    },
    {
        // A rider paid before partner earnings counts as 0 earnings − deductions.
        name: 'Payout whose latest run net does not match its riders',
        sql: `SELECT TO_CHAR(r.week_start, 'YYYY-MM-DD') AS week_start,
                     r.total_net_payout::float8 AS run_net,
                     COALESCE((SELECT SUM(COALESCE(net_payout, -total_amount)) FROM payout_items i
                               WHERE i.week_start = r.week_start), 0)::float8 AS riders_net
              FROM payout_runs r
              WHERE r.run_number = (SELECT MAX(run_number) FROM payout_runs x WHERE x.week_start = r.week_start)
                AND r.total_net_payout IS NOT NULL
                AND r.total_net_payout <> COALESCE((SELECT SUM(COALESCE(net_payout, -total_amount)) FROM payout_items i
                                                    WHERE i.week_start = r.week_start), 0)`
    },
    {
        // The webhook, an admin or a payout run always records the step that ended an escalation.
        name: 'Closed escalation without its closing event',
        sql: `SELECT e.escalation_id, e.rider_id, e.status
              FROM rider_escalations e
              WHERE e.status <> 'Open'
                AND NOT EXISTS (SELECT 1 FROM escalation_events ev
                                WHERE ev.escalation_id = e.escalation_id
                                  AND ev.event_type = ANY (ARRAY['Paid', 'MarkedPaid', 'Waived', 'Recovered', 'Closed']))`
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
