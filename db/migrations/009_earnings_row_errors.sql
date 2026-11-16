-- Partner earnings rows that failed to import block the payout of their week until they are fixed or dismissed.
-- Negative amounts (partner penalties) are allowed.
-- Apply with: npm run db:migrate

BEGIN;

ALTER TABLE public.partner_earnings
    DROP CONSTRAINT partner_earnings_amount_check;

-- The partner ID and date a failed earnings row was for, when they could be read.
-- Errors from before this migration have no partner, so they never block a payout.
ALTER TABLE public.import_row_errors
    ADD COLUMN partner_id integer REFERENCES public.partners(partner_id),
    ADD COLUMN partner_rider_id character varying(100),
    ADD COLUMN earning_date date,
    ADD COLUMN resolved_at timestamp with time zone,
    ADD COLUMN resolved_by bigint REFERENCES public.users(user_id),
    ADD COLUMN resolve_note text,
    ADD CONSTRAINT import_row_errors_resolved_check CHECK (((resolved_at IS NULL) = (resolve_note IS NULL)));

CREATE INDEX idx_import_row_errors_open_earnings ON public.import_row_errors
    USING btree (partner_id, partner_rider_id, earning_date)
    WHERE ((partner_id IS NOT NULL) AND (resolved_at IS NULL));

COMMIT;
