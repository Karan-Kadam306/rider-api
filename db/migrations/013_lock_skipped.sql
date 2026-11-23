-- Adds the Skipped lock status: a payout raised Payment Due automatically but did not lock the bike,
-- because the rider's team leader logged a payment promise that is still due. An admin can lock it later.
-- The LockSkipped event records why on the escalation's timeline.
-- Apply with: npm run db:migrate

BEGIN;

ALTER TABLE public.rider_escalations DROP CONSTRAINT rider_escalations_lock_status_check;
ALTER TABLE public.rider_escalations ADD CONSTRAINT rider_escalations_lock_status_check
    CHECK ((lock_status = ANY (ARRAY['Locked'::text, 'Unlocked'::text, 'NoBike'::text, 'Failed'::text, 'Skipped'::text])));

ALTER TABLE public.escalation_events DROP CONSTRAINT escalation_events_type_check;
ALTER TABLE public.escalation_events ADD CONSTRAINT escalation_events_type_check
    CHECK ((event_type = ANY (ARRAY['Raised'::text, 'BikeLocked'::text, 'LockFailed'::text, 'LinkSent'::text, 'Paid'::text, 'MarkedPaid'::text, 'Waived'::text, 'Recovered'::text, 'Closed'::text, 'BikeUnlocked'::text, 'UnlockFailed'::text, 'LockSkipped'::text])));

COMMIT;
