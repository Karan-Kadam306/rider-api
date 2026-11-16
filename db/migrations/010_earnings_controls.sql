-- History of every change to a partner earning, and partner IDs that are always set aside.
-- Apply with: npm run db:migrate

BEGIN;

-- One row per change to an earning's amount, status or rider, written by a trigger so no code path can skip it.
-- import_id is the file that made the change; otherwise changed_by is the reviewer (resolve, dismiss, move).
CREATE TABLE public.partner_earning_changes (
    change_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    earning_id bigint NOT NULL REFERENCES public.partner_earnings(earning_id),
    old_amount numeric(10,2) NOT NULL,
    new_amount numeric(10,2) NOT NULL,
    old_status text NOT NULL,
    new_status text NOT NULL,
    old_rider_id character varying(30),
    new_rider_id character varying(30),
    import_id bigint REFERENCES public.import_batches(import_id),
    changed_by bigint REFERENCES public.users(user_id),
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_partner_earning_changes_earning ON public.partner_earning_changes USING btree (earning_id, changed_at);

CREATE FUNCTION public.log_partner_earning_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    from_import boolean := NEW.import_id IS DISTINCT FROM OLD.import_id;
BEGIN
    INSERT INTO public.partner_earning_changes
        (earning_id, old_amount, new_amount, old_status, new_status, old_rider_id, new_rider_id, import_id, changed_by)
    VALUES (
        NEW.earning_id, OLD.amount, NEW.amount, OLD.status, NEW.status, OLD.rider_id, NEW.rider_id,
        CASE WHEN from_import THEN NEW.import_id END,
        CASE
            WHEN from_import THEN (SELECT uploaded_by FROM public.import_batches WHERE import_id = NEW.import_id)
            ELSE NEW.reviewed_by
        END
    );

    RETURN NULL;
END;
$$;

CREATE TRIGGER partner_earnings_log_change
    AFTER UPDATE ON public.partner_earnings
    FOR EACH ROW
    WHEN ((OLD.amount, OLD.status, OLD.rider_id) IS DISTINCT FROM (NEW.amount, NEW.status, NEW.rider_id))
    EXECUTE FUNCTION public.log_partner_earning_change();

-- Partner IDs a reviewer chose to always ignore (e.g. another fleet's rider): their new unmatched rows are
-- saved as Dismissed with this reason instead of waiting in Pending Review. A mapping still wins.
CREATE TABLE public.partner_ignored_ids (
    partner_id integer NOT NULL REFERENCES public.partners(partner_id),
    partner_rider_id character varying(100) NOT NULL,
    reason text NOT NULL,
    created_by bigint REFERENCES public.users(user_id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (partner_id, partner_rider_id)
);

COMMIT;
