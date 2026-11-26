-- Admin review of rider applications:
--   application_bank_accounts   reviewed like a document (the penny-drop result stays separate)
--   rider_applications.change_note   what the reviewer asked the rider to fix
--   riders.name                 widened to 150, the length the rider edit already allows, so an
--                               approved applicant's first name and surname always fit
-- Apply with: npm run db:migrate

BEGIN;

ALTER TABLE public.application_bank_accounts
    ADD COLUMN review_status text DEFAULT 'Pending'::text NOT NULL,
    ADD COLUMN review_reason character varying(500),
    ADD COLUMN reviewed_by_user_id bigint REFERENCES public.users(user_id),
    ADD COLUMN reviewed_at timestamp with time zone,
    ADD CONSTRAINT application_bank_accounts_review_check CHECK ((review_status = ANY (ARRAY['Pending'::text, 'Verified'::text, 'Rejected'::text]))),
    ADD CONSTRAINT application_bank_accounts_reason_check CHECK (((review_status <> 'Rejected'::text) OR (COALESCE(btrim((review_reason)::text), ''::text) <> ''::text)));

ALTER TABLE public.rider_applications ADD COLUMN change_note character varying(500);

ALTER TABLE public.riders ALTER COLUMN name TYPE character varying(150);

COMMIT;
