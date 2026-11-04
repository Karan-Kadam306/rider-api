-- Records failed sign-ins so repeated password guessing can be slowed down.
-- Apply with: npm run db:migrate

BEGIN;

-- One failed sign-in attempt. Rows older than a day are deleted as new failures arrive.
CREATE TABLE public.login_failures (
    login_failure_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Normalized (lowercase) email that was tried; it may not belong to any user.
    email character varying(254) NOT NULL,
    ip_address character varying(45) NOT NULL,
    failed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_login_failures_email ON public.login_failures USING btree (email, failed_at);
CREATE INDEX idx_login_failures_ip ON public.login_failures USING btree (ip_address, failed_at);

COMMIT;
