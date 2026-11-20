// One row per active team leader for the dates [from, to] (IST days), including leaders with no activity.
// Calls and promises are what the leader logged. Recovered dues count escalations marked Paid while the
// leader held the rider. Owing now is about the riders they hold today.
async function findTeamLeaderStats(client, { from, to, today }) {
    const result = await client.query(
        `WITH period AS (
             SELECT ($1::date)::timestamp AT TIME ZONE 'Asia/Kolkata' AS start_at,
                    ($2::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata' AS end_at
         ),
         leaders AS (
             SELECT user_id, name FROM users WHERE role = 'team_leader' AND is_active
         ),
         held AS (
             SELECT user_id, COUNT(*)::int AS riders
             FROM team_leader_riders
             WHERE removed_at IS NULL
             GROUP BY user_id
         ),
         calls AS (
             SELECT f.user_id, COUNT(*)::int AS calls, COUNT(DISTINCT f.rider_id)::int AS riders_called
             FROM rider_follow_ups f, period
             WHERE f.created_at >= period.start_at AND f.created_at < period.end_at
             GROUP BY f.user_id
         ),
         promises AS (
             SELECT f.user_id,
                    COUNT(*)::int AS made,
                    COUNT(*) FILTER (WHERE paid.kept)::int AS kept,
                    COUNT(*) FILTER (WHERE NOT paid.kept AND f.promise_date < $3)::int AS broken
             FROM rider_follow_ups f
             CROSS JOIN period
             CROSS JOIN LATERAL (
                 SELECT EXISTS (
                     SELECT 1 FROM rider_follow_ups later
                     WHERE later.rider_id = f.rider_id
                       AND later.created_at > f.created_at
                       AND later.outcome = 'Paid'
                 ) AS kept
             ) paid
             WHERE f.outcome = 'Promised to Pay'
               AND f.created_at >= period.start_at AND f.created_at < period.end_at
             GROUP BY f.user_id
         ),
         recovered AS (
             SELECT l.user_id, COUNT(*)::int AS count, SUM(e.amount)::float8 AS amount
             FROM rider_escalations e
             CROSS JOIN period
             JOIN team_leader_riders l
               ON l.rider_id = e.rider_id
              AND l.assigned_at <= e.resolved_at
              AND (l.removed_at IS NULL OR l.removed_at > e.resolved_at)
             WHERE e.kind <> 'Record' AND e.status = 'Paid'
               AND e.resolved_at >= period.start_at AND e.resolved_at < period.end_at
             GROUP BY l.user_id
         ),
         owing AS (
             SELECT l.user_id, COUNT(*)::int AS count, SUM(-last.net_payout)::float8 AS amount
             FROM team_leader_riders l
             JOIN LATERAL (
                 SELECT p.net_payout
                 FROM payout_items p
                 WHERE p.rider_id = l.rider_id
                 ORDER BY p.week_start DESC
                 LIMIT 1
             ) last ON true
             WHERE l.removed_at IS NULL AND last.net_payout < 0
             GROUP BY l.user_id
         )
         SELECT leaders.user_id::int AS user_id, leaders.name,
                COALESCE(held.riders, 0) AS riders,
                COALESCE(calls.calls, 0) AS calls,
                COALESCE(calls.riders_called, 0) AS riders_called,
                COALESCE(promises.made, 0) AS promises_made,
                COALESCE(promises.kept, 0) AS promises_kept,
                COALESCE(promises.broken, 0) AS promises_broken,
                COALESCE(recovered.count, 0) AS recovered_count,
                COALESCE(recovered.amount, 0) AS recovered_amount,
                COALESCE(owing.count, 0) AS owing_count,
                COALESCE(owing.amount, 0) AS owing_amount
         FROM leaders
         LEFT JOIN held ON held.user_id = leaders.user_id
         LEFT JOIN calls ON calls.user_id = leaders.user_id
         LEFT JOIN promises ON promises.user_id = leaders.user_id
         LEFT JOIN recovered ON recovered.user_id = leaders.user_id
         LEFT JOIN owing ON owing.user_id = leaders.user_id
         ORDER BY leaders.name, leaders.user_id`,
        [from, to, today]
    );

    return result.rows;
}

module.exports = {
    findTeamLeaderStats
};
