-- Demo data for the manual test. Billing week used: Mon 26 Oct – Sun 1 Nov 2026.
-- Timestamps are IST.

INSERT INTO riders (rider_id, name, phone, status, terminated_on) VALUES
    ('DM-001', 'Amit Patil',     '9000000001', 'Active',     NULL),
    ('DM-002', 'Sneha Kulkarni', '9000000002', 'Active',     NULL),
    ('DM-003', 'Vikram Rao',     '9000000003', 'Active',     NULL),
    ('DM-004', 'Priya Nair',     '9000000004', 'Active',     NULL),
    ('DM-005', 'Rohan Shah',     '9000000005', 'Active',     NULL),
    ('DM-006', 'Kavya Iyer',     '9000000006', 'Terminated', '2026-10-27'),
    ('DM-007', 'Arjun Mehta',    '9000000007', 'Inactive',   NULL),
    ('DM-008', 'Meera Joshi',    '9000000008', 'Active',     NULL);

INSERT INTO bikes (chassis_number, registration_number, status) VALUES
    ('DEMO-VIN-1', 'MH12DM0001', 'Assigned'),
    ('DEMO-VIN-2', 'MH12DM0002', 'Available'),
    ('DEMO-VIN-3', NULL,         'Assigned'),
    ('DEMO-VIN-4', NULL,         'Available'),
    ('DEMO-VIN-5', NULL,         'Assigned'),
    ('DEMO-VIN-6', NULL,         'Available'),
    ('DEMO-VIN-7', NULL,         'Available'),
    ('DEMO-VIN-8', NULL,         'Maintenance');

-- (bike, rider, assigned, returned)
INSERT INTO bike_assignments (bike_id, rider_id, assigned_at, returned_at)
SELECT b.bike_id, a.rider_id,
       a.assigned_at::timestamp AT TIME ZONE 'Asia/Kolkata',
       a.returned_at::timestamp AT TIME ZONE 'Asia/Kolkata'
FROM (VALUES
    -- Amit: whole week, still riding.
    ('DEMO-VIN-1', 'DM-001', '2026-10-20 09:00', NULL),
    -- Sneha: returned Thursday evening.
    ('DEMO-VIN-2', 'DM-002', '2026-10-20 09:00', '2026-10-29 18:00'),
    -- DEMO-VIN-3 is shared on Wednesday: Vikram in the morning, Priya from the afternoon on.
    ('DEMO-VIN-3', 'DM-003', '2026-10-28 08:00', '2026-10-28 12:00'),
    ('DEMO-VIN-3', 'DM-004', '2026-10-28 13:00', NULL),
    -- Rohan swaps bikes on Friday.
    ('DEMO-VIN-4', 'DM-005', '2026-10-30 09:00', '2026-10-30 13:00'),
    ('DEMO-VIN-5', 'DM-005', '2026-10-30 14:00', NULL),
    -- Kavya: terminated Tuesday, bike returned that evening.
    ('DEMO-VIN-6', 'DM-006', '2026-10-20 09:00', '2026-10-27 18:00')
) AS a (chassis_number, rider_id, assigned_at, returned_at)
JOIN bikes b ON b.chassis_number = a.chassis_number;

-- Partner IDs for the earnings sheets in demo/csv/earnings (same list as 0-partner-mappings.csv).
-- BLK-9999, ZPT-9999 and ZOM-7777 are left unmapped so they land in Pending Review.
INSERT INTO rider_partner_mappings (rider_id, partner_id, partner_rider_id)
SELECT m.rider_id, p.partner_id, m.partner_rider_id
FROM (VALUES
    ('DM-001', 'blinkit', 'BLK-1001'),
    ('DM-002', 'blinkit', 'BLK-1002'),
    ('DM-003', 'blinkit', 'BLK-1003'),
    ('DM-006', 'blinkit', 'BLK-1006'),
    ('DM-001', 'zepto',   'ZPT-2001'),
    ('DM-004', 'zepto',   'ZPT-2004'),
    ('DM-005', 'zepto',   'ZPT-2005'),
    ('DM-002', 'zomato',  'ZOM-3002'),
    ('DM-005', 'zomato',  'ZOM-3005'),
    ('DM-008', 'zomato',  'ZOM-3008')
) AS m (rider_id, partner_code, partner_rider_id)
JOIN partners p ON p.code = m.partner_code;

-- Escalations demo, dated from today so it always lands in the current week (IST, Monday start).
-- Meera paid out −₹350 last week, so she starts this week owing ₹350: try Payment Due on her.
WITH last_week AS (
    SELECT (date_trunc('week', now() AT TIME ZONE 'Asia/Kolkata'))::date - 7 AS week_start
), run AS (
    INSERT INTO payout_runs (week_start, run_number, rider_count, updated_count, total_amount, total_earnings, total_net_payout)
    SELECT week_start, 1, 1, 1, 413, 63, -350 FROM last_week
    RETURNING run_id, week_start
)
INSERT INTO payout_items
    (week_start, rider_id, rental_days, total_rental, total_km, total_energy_charge, total_amount,
     total_earnings, net_payout, first_run_id, updated_run_id)
SELECT week_start, 'DM-008', 7, 413, 0, 0, 413, 63, -350, run_id, run_id FROM run;

-- Amit has an open ₹750 charge with his bike locked: open its payment link from his Escalations tab.
WITH escalation AS (
    INSERT INTO rider_escalations
        (rider_id, kind, reasons, comment, amount, week_start, lock_status, bike_id, lock_ref, payment_token)
    SELECT 'DM-001', 'Charge', ARRAY['Bike Misuse'], 'Side mirror broken', 750,
           (date_trunc('week', now() AT TIME ZONE 'Asia/Kolkata'))::date,
           'Locked', bike_id, 'MOCK-LOCK-DEMO', md5(random()::text) || md5(random()::text)
    FROM bikes
    WHERE chassis_number = 'DEMO-VIN-1'
    RETURNING escalation_id
)
INSERT INTO escalation_events (escalation_id, event_type)
SELECT escalation_id, event_type
FROM escalation, unnest(ARRAY['Raised', 'LinkSent', 'BikeLocked']) AS event_type;

-- ---------- Team leaders demo ----------
-- The users come from demo/setupDemoDb.js. Every date here is relative to today (IST), so the critical
-- queue, promises and Analytics always have something to show. One rider per scenario:
--   Neha    DM-009  Ravi + Sunita: owes ₹420, promise broken yesterday, last call 3 days ago (Critical, Call due)
--   Sanjay  DM-010  Ravi: owes ₹280, promise due in 2 days (High; locking him needs the admin to confirm)
--   Farhan  DM-011  Ravi: owes ₹150, never called (High, Call due): raise Payment Due, mark it paid, he drops out
--   Pooja   DM-012  Ravi: 5 km a day for a week (Low: lowest km)
--   Kiran   DM-013  Ravi: 90 km a day; last week's promise was kept by a paid ₹300 charge (Analytics: kept, recovered)
--   Dev     DM-014  Ravi: very low km but on approved leave, so not ranked
--   Anil    DM-015  Ravi: very low km but got his bike 2 days ago, so not ranked
--   Amit    DM-001  Sunita: the open ₹750 charge above, bike locked (Critical)
--   Meera   DM-008  Sunita: owes ₹350 from last week (High)
-- Imran has no riders: use him to try assigning a team leader.

CREATE TEMP TABLE demo_day AS
SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS today,
       (date_trunc('week', now() AT TIME ZONE 'Asia/Kolkata'))::date AS week_start;

INSERT INTO riders (rider_id, name, phone, status) VALUES
    ('DM-009', 'Neha Gupta',   '9000000009', 'Active'),
    ('DM-010', 'Sanjay Verma', '9000000010', 'Active'),
    ('DM-011', 'Farhan Khan',  '9000000011', 'Active'),
    ('DM-012', 'Pooja Reddy',  '9000000012', 'Active'),
    ('DM-013', 'Kiran Desai',  '9000000013', 'Active'),
    ('DM-014', 'Dev Malhotra', '9000000014', 'Active'),
    ('DM-015', 'Anil Yadav',   '9000000015', 'Active');

INSERT INTO bikes (chassis_number, registration_number, status) VALUES
    ('DEMO-VIN-12', 'MH12DM0012', 'Assigned'),
    ('DEMO-VIN-13', 'MH12DM0013', 'Assigned'),
    ('DEMO-VIN-14', 'MH12DM0014', 'Assigned'),
    ('DEMO-VIN-15', 'MH12DM0015', 'Assigned');

-- Pooja, Kiran and Dev have had their bikes for weeks; Anil only for 2 days.
INSERT INTO bike_assignments (bike_id, rider_id, assigned_at)
SELECT b.bike_id, a.rider_id, now() - a.held
FROM (VALUES
    ('DEMO-VIN-12', 'DM-012', interval '20 days'),
    ('DEMO-VIN-13', 'DM-013', interval '20 days'),
    ('DEMO-VIN-14', 'DM-014', interval '20 days'),
    ('DEMO-VIN-15', 'DM-015', interval '2 days')
) AS a (chassis_number, rider_id, held)
JOIN bikes b ON b.chassis_number = a.chassis_number;

-- Assigned two weeks ago, so Kiran's paid charge counts as Ravi's recovery.
INSERT INTO team_leader_riders (user_id, rider_id, assigned_at, assigned_by)
SELECT leader.user_id, m.rider_id, now() - interval '14 days', admin.user_id
FROM (VALUES
    ('ravi.tl@demo.local', 'DM-009'),
    ('ravi.tl@demo.local', 'DM-010'),
    ('ravi.tl@demo.local', 'DM-011'),
    ('ravi.tl@demo.local', 'DM-012'),
    ('ravi.tl@demo.local', 'DM-013'),
    ('ravi.tl@demo.local', 'DM-014'),
    ('ravi.tl@demo.local', 'DM-015'),
    ('sunita.tl@demo.local', 'DM-009'),
    ('sunita.tl@demo.local', 'DM-001'),
    ('sunita.tl@demo.local', 'DM-008')
) AS m (email, rider_id)
JOIN users leader ON leader.email = m.email
CROSS JOIN (SELECT user_id FROM users WHERE email = 'admin@demo.local') admin;

-- Neha, Sanjay and Farhan ended last week negative, in the same payout run as Meera.
INSERT INTO payout_items
    (week_start, rider_id, rental_days, total_rental, total_km, total_energy_charge, total_amount,
     total_earnings, net_payout, first_run_id, updated_run_id)
SELECT run.week_start, m.rider_id, 7, 413, 0, m.energy, 413 + m.energy, m.earnings, m.net, run.run_id, run.run_id
FROM payout_runs run
CROSS JOIN (VALUES
    ('DM-009', 100, 93, -420),
    ('DM-010', 0, 133, -280),
    ('DM-011', 0, 263, -150)
) AS m (rider_id, energy, earnings, net)
WHERE run.week_start = (SELECT week_start - 7 FROM demo_day) AND run.run_number = 1;

UPDATE payout_runs
SET rider_count = 4, updated_count = 4, total_amount = 1752, total_earnings = 552, total_net_payout = -1200
WHERE week_start = (SELECT week_start - 7 FROM demo_day) AND run_number = 1;

-- Daily km for the last 7 full days. Dev skips his leave days; Anil only has the 2 days he held the bike.
INSERT INTO daily_km_records (reported_vin, bike_id, usage_date, daily_km, rider_id, status, source_file_name)
SELECT b.chassis_number, b.bike_id, d.today - k.days_ago, k.km, k.rider_id, 'Validated', 'demo-seed'
FROM (VALUES
    ('DM-012', 'DEMO-VIN-12', 5, ARRAY[1, 2, 3, 4, 5, 6, 7]),
    ('DM-013', 'DEMO-VIN-13', 90, ARRAY[1, 2, 3, 4, 5, 6, 7]),
    ('DM-014', 'DEMO-VIN-14', 3, ARRAY[1, 2, 6, 7]),
    ('DM-015', 'DEMO-VIN-15', 4, ARRAY[1, 2])
) AS km_plan (rider_id, chassis_number, km, days)
CROSS JOIN LATERAL (SELECT km_plan.rider_id, km_plan.km, unnest(km_plan.days) AS days_ago) k
JOIN bikes b ON b.chassis_number = km_plan.chassis_number
CROSS JOIN demo_day d;

INSERT INTO rider_inactive_periods (rider_id, start_date, end_date, approved)
SELECT 'DM-014', today - 5, today - 3, true FROM demo_day;

-- Kiran's ₹300 charge, paid 5 days ago: it keeps the promise he made the day before.
WITH escalation AS (
    INSERT INTO rider_escalations
        (rider_id, kind, reasons, comment, amount, week_start, status, lock_status, bike_id, lock_ref,
         payment_token, payment_ref, resolved_at, created_at)
    SELECT 'DM-013', 'Charge', ARRAY['Bike Misuse'], 'Helmet lost', 300,
           (date_trunc('week', (now() - interval '6 days') AT TIME ZONE 'Asia/Kolkata'))::date,
           'Paid', 'Unlocked', bike_id, 'MOCK-LOCK-DEMO-2', md5(random()::text) || md5(random()::text),
           'UPI-DEMO-300', now() - interval '5 days', now() - interval '6 days'
    FROM bikes
    WHERE chassis_number = 'DEMO-VIN-13'
    RETURNING escalation_id
)
INSERT INTO escalation_events (escalation_id, event_type)
SELECT escalation_id, event_type
FROM escalation, unnest(ARRAY['Raised', 'LinkSent', 'BikeLocked', 'Paid', 'BikeUnlocked']) AS event_type;

-- Follow-ups. They cannot be changed later, so they are written once here with past times.
INSERT INTO rider_follow_ups (rider_id, user_id, reason, outcome, note, promise_date, promise_amount, created_at)
SELECT f.rider_id, u.user_id, f.reason, f.outcome, f.note, d.today + f.promise_in_days, f.promise_amount, now() - f.ago
FROM (VALUES
    ('DM-009', 'ravi.tl@demo.local', 'Payment Due', 'Promised to Pay', 'Will pay after Thursday''s Zomato payout.', -1, 420, interval '3 days'),
    ('DM-010', 'ravi.tl@demo.local', 'Payment Due', 'Promised to Pay', 'Can pay ₹280 in two days, waiting for salary.', 2, 280, interval '1 hour'),
    ('DM-013', 'ravi.tl@demo.local', 'Payment Due', 'Promised to Pay', 'Will pay for the helmet tomorrow.', -5, 300, interval '6 days'),
    ('DM-012', 'ravi.tl@demo.local', 'Performance', 'Will Improve', 'Phone was broken; back to full shifts from Monday.', NULL, NULL, interval '2 days')
) AS f (rider_id, email, reason, outcome, note, promise_in_days, promise_amount, ago)
JOIN users u ON u.email = f.email
CROSS JOIN demo_day d;

DROP TABLE demo_day;
