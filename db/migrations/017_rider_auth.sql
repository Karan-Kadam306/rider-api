-- Adds sign-in for the rider app: a one-time code by SMS, then a bearer token.
--   rider_otps      codes sent; also counted to limit how often codes can be sent
--   rider_sessions  signed-in app installs. The app holds the raw token; only its SHA-256 hash is stored.
-- A session belongs to a phone, so an applicant who is approved keeps the same session as a rider.
-- Apply with: npm run db:migrate

BEGIN;

-- Rows older than a day are deleted as new codes are sent.
CREATE TABLE public.rider_otps (
    otp_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    phone character varying(15) NOT NULL,
    -- HMAC of phone and code (ID_HASH_KEY), so a leaked row cannot be tried offline.
    code_hash character(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    -- Wrong codes tried; the code stops working after 5.
    attempts integer DEFAULT 0 NOT NULL,
    consumed_at timestamp with time zone,
    ip_address character varying(45) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rider_otps_attempts_check CHECK ((attempts >= 0))
);

CREATE INDEX idx_rider_otps_phone ON public.rider_otps USING btree (phone, created_at);
CREATE INDEX idx_rider_otps_ip ON public.rider_otps USING btree (ip_address, created_at);

CREATE TABLE public.rider_sessions (
    token_hash character(64) PRIMARY KEY,
    phone character varying(15) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    device_info character varying(200),
    ip_address character varying(45)
);

CREATE INDEX idx_rider_sessions_phone ON public.rider_sessions USING btree (phone) WHERE (revoked_at IS NULL);

COMMIT;
