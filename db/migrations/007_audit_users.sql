-- Records which user uploaded a file, changed a partner mapping, or resolved or dismissed earnings.
-- Rows from before this migration have no user.
-- Apply with: npm run db:migrate

BEGIN;

-- uploaded_by was never written, so the type change has no values to convert.
ALTER TABLE public.import_batches
    ALTER COLUMN uploaded_by TYPE bigint USING uploaded_by::bigint,
    ADD CONSTRAINT import_batches_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(user_id);

ALTER TABLE public.rider_partner_mappings
    ADD COLUMN created_by bigint REFERENCES public.users(user_id),
    ADD COLUMN deactivated_by bigint REFERENCES public.users(user_id);

-- Who matched (by resolving or saving a mapping) or dismissed the row; empty when an import matched it.
ALTER TABLE public.partner_earnings
    ADD COLUMN reviewed_by bigint REFERENCES public.users(user_id),
    ADD COLUMN reviewed_at timestamp with time zone;

COMMIT;
