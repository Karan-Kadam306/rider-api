-- Adds rider escalations, raised by an admin from the rider page.
-- Charge (damage, fine, ...): locks the bike and sends a payment link; deducted from its week's payout
--   unless paid or waived first.
-- Collection (Payment Due): collects the carried negative balance; paying or waiving it clears the carry.
-- Record (no amount, e.g. a safety concern): kept for history only, no lock or link; an admin closes it.
-- Apply with: npm run db:migrate

BEGIN;

CREATE TABLE public.rider_escalations (
    escalation_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rider_id character varying(30) NOT NULL REFERENCES public.riders(rider_id),
    kind text NOT NULL,
    reasons text[] NOT NULL,
    comment text,
    amount numeric(10,2),
    -- Monday of the IST week it was raised; a Charge is deducted from this week's payout.
    week_start date NOT NULL,
    status text DEFAULT 'Open'::text NOT NULL,
    -- Empty for a Record. A Recovered charge that leaves the net negative stays Locked
    -- until the bike is returned to the hub.
    lock_status text,
    bike_id bigint REFERENCES public.bikes(bike_id),
    lock_ref text,
    payment_token text UNIQUE,
    -- The provider's payment ID from the webhook, or the reference an admin typed.
    payment_ref text UNIQUE,
    resolution_note text,
    resolved_at timestamp with time zone,
    resolved_by bigint REFERENCES public.users(user_id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint REFERENCES public.users(user_id),
    CONSTRAINT rider_escalations_kind_check CHECK ((kind = ANY (ARRAY['Charge'::text, 'Collection'::text, 'Record'::text]))),
    CONSTRAINT rider_escalations_reasons_check CHECK (((cardinality(reasons) > 0) AND (reasons <@ ARRAY['Payment Due'::text, 'SOP Violation'::text, 'Attendance Issues'::text, 'Safety Concern'::text, 'Customer Complaint'::text, 'Document Non-Compliance'::text, 'Bike Misuse'::text, 'Partner Deactivation'::text, 'Policy Violation'::text, 'Other'::text]))),
    CONSTRAINT rider_escalations_kind_reasons_check CHECK (((kind = 'Collection'::text) = ('Payment Due'::text = ANY (reasons)))),
    CONSTRAINT rider_escalations_comment_check CHECK ((('Other'::text <> ALL (reasons)) OR (btrim(comment) <> ''::text))),
    CONSTRAINT rider_escalations_amount_check CHECK (((kind = 'Record'::text) = (amount IS NULL)) AND ((amount IS NULL) OR (amount > (0)::numeric))),
    CONSTRAINT rider_escalations_record_check CHECK ((((kind = 'Record'::text) = (payment_token IS NULL)) AND ((kind = 'Record'::text) = (lock_status IS NULL)))),
    CONSTRAINT rider_escalations_monday_check CHECK ((EXTRACT(isodow FROM week_start) = (1)::numeric)),
    CONSTRAINT rider_escalations_status_check CHECK ((status = ANY (ARRAY['Open'::text, 'Paid'::text, 'Waived'::text, 'Recovered'::text, 'Closed'::text]))),
    CONSTRAINT rider_escalations_status_kind_check CHECK ((((status = 'Recovered'::text) <= (kind = 'Charge'::text)) AND ((status = 'Closed'::text) <= (kind = 'Record'::text)) AND ((status = ANY (ARRAY['Paid'::text, 'Waived'::text])) <= (kind <> 'Record'::text)))),
    CONSTRAINT rider_escalations_lock_status_check CHECK ((lock_status = ANY (ARRAY['Locked'::text, 'Unlocked'::text, 'NoBike'::text, 'Failed'::text]))),
    CONSTRAINT rider_escalations_resolved_check CHECK (((status = 'Open'::text) = (resolved_at IS NULL)))
);

-- A rider has at most one open Charge or Collection; Records do not block one.
CREATE UNIQUE INDEX idx_rider_escalations_open_rider ON public.rider_escalations USING btree (rider_id) WHERE ((status = 'Open'::text) AND (kind <> 'Record'::text));
CREATE INDEX idx_rider_escalations_rider ON public.rider_escalations USING btree (rider_id, created_at DESC);
CREATE INDEX idx_rider_escalations_week_status ON public.rider_escalations USING btree (week_start, status);
-- Bike return finds the escalations still holding the bike's lock.
CREATE INDEX idx_rider_escalations_locked_bike ON public.rider_escalations USING btree (bike_id) WHERE (lock_status = 'Locked'::text);

-- Timeline of an escalation: raised, locked, paid, waived, recovered, closed, unlocked.
-- user_id is empty when the webhook or a payout run made the change.
CREATE TABLE public.escalation_events (
    event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    escalation_id bigint NOT NULL REFERENCES public.rider_escalations(escalation_id),
    event_type text NOT NULL,
    detail jsonb,
    user_id bigint REFERENCES public.users(user_id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT escalation_events_type_check CHECK ((event_type = ANY (ARRAY['Raised'::text, 'BikeLocked'::text, 'LockFailed'::text, 'LinkSent'::text, 'Paid'::text, 'MarkedPaid'::text, 'Waived'::text, 'Recovered'::text, 'Closed'::text, 'BikeUnlocked'::text, 'UnlockFailed'::text])))
);

CREATE INDEX idx_escalation_events_escalation ON public.escalation_events USING btree (escalation_id, created_at);

-- Payouts made before this migration have neither, so these stay empty for them.
ALTER TABLE public.payout_items
    ADD COLUMN escalation_charges numeric(10,2),
    ADD COLUMN balance_cleared numeric(10,2);

COMMIT;
