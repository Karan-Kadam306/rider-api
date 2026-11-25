-- Adds what the rider app's onboarding steps need on top of 016:
--   rider_applications.fix_steps  steps a reviewer sent back; the rider may change only these
--   application_checks            duplicate checks and ID/bank verifications run at submit
-- Checks only flag things for the reviewer; they never reject an application on their own.
-- Apply with: npm run db:migrate

BEGIN;

ALTER TABLE public.rider_applications ADD COLUMN fix_steps text[] DEFAULT '{}'::text[] NOT NULL;

-- Each submit adds a new set; the reviewer looks at the latest of each kind.
CREATE TABLE public.application_checks (
    check_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id bigint NOT NULL REFERENCES public.rider_applications(application_id),
    kind text NOT NULL,
    status text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT application_checks_kind_check CHECK ((kind = ANY (ARRAY['duplicate'::text, 'bank'::text, 'pan'::text, 'dl'::text]))),
    CONSTRAINT application_checks_status_check CHECK ((status = ANY (ARRAY['Clear'::text, 'Flagged'::text, 'Failed'::text])))
);

CREATE INDEX idx_application_checks_application ON public.application_checks USING btree (application_id, created_at);

COMMIT;
