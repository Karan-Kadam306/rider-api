-- Adds the follow-up log: what a rider said when a team leader (or staff) called them about
-- dues, performance or attendance, and any payment they promised.
-- Rows are never changed or deleted, so the log is a reliable history.
-- Apply with: npm run db:migrate

BEGIN;

CREATE TABLE public.rider_follow_ups (
    follow_up_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rider_id character varying(30) NOT NULL REFERENCES public.riders(rider_id),
    user_id bigint NOT NULL REFERENCES public.users(user_id),
    -- Optional: the escalation this follow-up was about.
    escalation_id bigint REFERENCES public.rider_escalations(escalation_id),
    reason text NOT NULL,
    outcome text NOT NULL,
    note text NOT NULL,
    -- Only for Promised to Pay: the date is required, the amount optional.
    promise_date date,
    promise_amount numeric(10,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rider_follow_ups_reason_check CHECK ((reason = ANY (ARRAY['Payment Due'::text, 'Performance'::text, 'Attendance'::text, 'Other'::text]))),
    CONSTRAINT rider_follow_ups_outcome_check CHECK ((outcome = ANY (ARRAY['Promised to Pay'::text, 'Paid'::text, 'Unreachable'::text, 'Refused'::text, 'Will Improve'::text, 'Other'::text]))),
    CONSTRAINT rider_follow_ups_note_check CHECK (((btrim(note) <> ''::text) AND (length(note) <= 1000))),
    CONSTRAINT rider_follow_ups_promise_check CHECK ((((outcome = 'Promised to Pay'::text) = (promise_date IS NOT NULL)) AND ((promise_amount IS NULL) OR ((outcome = 'Promised to Pay'::text) AND (promise_amount > (0)::numeric)))))
);

CREATE INDEX idx_rider_follow_ups_rider ON public.rider_follow_ups USING btree (rider_id, created_at DESC);

-- Append-only: refuse any change to a saved follow-up.
CREATE FUNCTION public.prevent_follow_up_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION 'Follow-ups cannot be changed or deleted';
END;
$$;

CREATE TRIGGER rider_follow_ups_append_only
    BEFORE UPDATE OR DELETE ON public.rider_follow_ups
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_follow_up_change();

COMMIT;
