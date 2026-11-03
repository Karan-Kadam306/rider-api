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
