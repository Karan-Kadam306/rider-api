-- Adds admin panel users and their login sessions.
-- Apply with: npm run db:migrate

BEGIN;

-- People who can sign in to the admin panel. Users are created with `npm run user:create`.
CREATE TABLE public.users (
    user_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Stored lowercase so sign-in is case-insensitive.
    email character varying(254) NOT NULL,
    name character varying(100) NOT NULL,
    password_hash text NOT NULL,
    -- admin: everything. staff: day-to-day work, but cannot close weeks or run payouts.
    role character varying(20) NOT NULL,
    -- Inactive users cannot sign in, and their sessions stop working.
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone,
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_email_lowercase_check CHECK (((email)::text = lower((email)::text))),
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::text[])))
);

-- One signed-in browser. The cookie holds the raw token; only its SHA-256 hash is stored.
CREATE TABLE public.sessions (
    token_hash character(64) PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);

CREATE INDEX idx_sessions_user ON public.sessions USING btree (user_id);

COMMIT;
