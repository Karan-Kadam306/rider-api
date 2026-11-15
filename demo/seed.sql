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
