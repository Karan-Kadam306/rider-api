-- Adds rider applications: what a new rider fills in the app before approval.
--   rider_applications          one per signup, numbered YS-APP-0000123; becomes a rider at approval
--   application_profiles        name, date of birth, address and emergency contact
--   application_documents       Aadhaar, PAN, DL, address proof and selfie, one review status each
--   application_document_files  the photos or PDFs of each document (stored outside the database)
--   application_bank_accounts   bank details for payouts
--   policy_versions / policy_acceptances  company policies and who accepted which version
--   application_events          the application's timeline
--   document_access_log         every time staff open a document file
-- ID and account numbers are stored encrypted, with an HMAC for duplicate lookups and the last 4
-- digits for display. A re-upload adds a new version and keeps the old one.
-- Apply with: npm run db:migrate

BEGIN;

CREATE SEQUENCE public.rider_application_no_seq;
CREATE SEQUENCE public.rider_code_seq;

CREATE TABLE public.rider_applications (
    application_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_no character varying(20) NOT NULL UNIQUE,
    phone character varying(15) NOT NULL,
    status text DEFAULT 'Draft'::text NOT NULL,
    current_step text DEFAULT 'address'::text NOT NULL,
    plan_type text,
    prepaid_pack_id bigint REFERENCES public.prepaid_packs(pack_id),
    hub_id bigint REFERENCES public.hubs(hub_id),
    rider_id character varying(30) UNIQUE REFERENCES public.riders(rider_id),
    is_test boolean DEFAULT false NOT NULL,
    is_reapplication boolean DEFAULT false NOT NULL,
    assisted_by_user_id bigint REFERENCES public.users(user_id),
    hold_reason character varying(500),
    reject_reason character varying(500),
    submitted_at timestamp with time zone,
    reviewed_by_user_id bigint REFERENCES public.users(user_id),
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rider_applications_status_check CHECK ((status = ANY (ARRAY['Draft'::text, 'Pending Review'::text, 'Changes Requested'::text, 'Resubmitted'::text, 'On Hold'::text, 'Rejected'::text, 'Payment Pending'::text, 'Bike Pending'::text, 'Completed'::text]))),
    CONSTRAINT rider_applications_step_check CHECK ((current_step = ANY (ARRAY['address'::text, 'aadhaar'::text, 'pan'::text, 'dl'::text, 'selfie'::text, 'emergency_contact'::text, 'policies'::text, 'bank'::text, 'plan'::text, 'summary'::text]))),
    -- Prepaid riders pick their first weekly pack; postpaid riders have none.
    CONSTRAINT rider_applications_plan_check CHECK ((((plan_type IS NULL) AND (prepaid_pack_id IS NULL)) OR ((plan_type = 'Postpaid'::text) AND (prepaid_pack_id IS NULL)) OR ((plan_type = 'Prepaid'::text) AND (prepaid_pack_id IS NOT NULL)))),
    CONSTRAINT rider_applications_submitted_check CHECK (((status = 'Draft'::text) OR (submitted_at IS NOT NULL))),
    -- Approval creates the rider, so every approved status has one.
    CONSTRAINT rider_applications_rider_check CHECK (((status <> ALL (ARRAY['Payment Pending'::text, 'Bike Pending'::text, 'Completed'::text])) OR (rider_id IS NOT NULL))),
    CONSTRAINT rider_applications_hold_check CHECK (((status <> 'On Hold'::text) OR (COALESCE(btrim((hold_reason)::text), ''::text) <> ''::text))),
    CONSTRAINT rider_applications_reject_check CHECK (((status <> 'Rejected'::text) OR (COALESCE(btrim((reject_reason)::text), ''::text) <> ''::text)))
);

-- A phone has at most one open application. Rejected ones may reapply; completed ones are riders.
CREATE UNIQUE INDEX idx_rider_applications_open_phone ON public.rider_applications USING btree (phone)
    WHERE (status <> ALL (ARRAY['Rejected'::text, 'Completed'::text]));

CREATE INDEX idx_rider_applications_status ON public.rider_applications USING btree (status, created_at DESC);

-- Personal details arrive with the application; address and emergency contact are later steps.
CREATE TABLE public.application_profiles (
    application_id bigint PRIMARY KEY REFERENCES public.rider_applications(application_id),
    first_name character varying(60) NOT NULL,
    surname character varying(60) NOT NULL,
    date_of_birth date NOT NULL,
    address_line1 character varying(200),
    address_line2 character varying(200),
    city character varying(60),
    state character varying(60),
    pincode character varying(6),
    address_proof_kind text,
    emergency_name character varying(100),
    emergency_relation character varying(40),
    emergency_phone character varying(15),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT application_profiles_name_check CHECK (((btrim((first_name)::text) <> ''::text) AND (btrim((surname)::text) <> ''::text))),
    CONSTRAINT application_profiles_proof_check CHECK (((address_proof_kind IS NULL) OR (address_proof_kind = ANY (ARRAY['Aadhaar'::text, 'Electricity Bill'::text, 'Rent Agreement'::text, 'Bank Statement'::text, 'Other'::text]))))
);

CREATE TABLE public.application_documents (
    document_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id bigint NOT NULL REFERENCES public.rider_applications(application_id),
    doc_type text NOT NULL,
    number_enc text,
    number_hash character(64),
    number_last4 character varying(4),
    expiry_date date,
    review_status text DEFAULT 'Pending'::text NOT NULL,
    review_reason character varying(500),
    reviewed_by_user_id bigint REFERENCES public.users(user_id),
    reviewed_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT application_documents_type_check CHECK ((doc_type = ANY (ARRAY['aadhaar'::text, 'pan'::text, 'dl'::text, 'address_proof'::text, 'selfie'::text]))),
    -- Aadhaar, PAN and DL always have a number; the selfie and address proof never do.
    CONSTRAINT application_documents_number_check CHECK ((((doc_type = ANY (ARRAY['aadhaar'::text, 'pan'::text, 'dl'::text])) AND (number_enc IS NOT NULL) AND (number_hash IS NOT NULL) AND (number_last4 IS NOT NULL)) OR ((doc_type <> ALL (ARRAY['aadhaar'::text, 'pan'::text, 'dl'::text])) AND (number_enc IS NULL) AND (number_hash IS NULL) AND (number_last4 IS NULL)))),
    CONSTRAINT application_documents_expiry_check CHECK ((((doc_type = 'dl'::text) AND (expiry_date IS NOT NULL)) OR ((doc_type <> 'dl'::text) AND (expiry_date IS NULL)))),
    CONSTRAINT application_documents_review_check CHECK ((review_status = ANY (ARRAY['Pending'::text, 'Verified'::text, 'Rejected'::text]))),
    CONSTRAINT application_documents_reason_check CHECK (((review_status <> 'Rejected'::text) OR (COALESCE(btrim((review_reason)::text), ''::text) <> ''::text))),
    CONSTRAINT application_documents_version_check CHECK ((version >= 1)),
    UNIQUE (application_id, doc_type, version)
);

CREATE UNIQUE INDEX idx_application_documents_current ON public.application_documents USING btree (application_id, doc_type)
    WHERE is_current;

-- Duplicate checks look up the same number on other applications.
CREATE INDEX idx_application_documents_hash ON public.application_documents USING btree (doc_type, number_hash)
    WHERE (number_hash IS NOT NULL);

CREATE TABLE public.application_document_files (
    file_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id bigint NOT NULL REFERENCES public.application_documents(document_id),
    side text NOT NULL,
    storage_key character varying(100) NOT NULL UNIQUE,
    sha256 character(64) NOT NULL,
    mime_type text NOT NULL,
    size_bytes integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT application_document_files_side_check CHECK ((side = ANY (ARRAY['front'::text, 'back'::text, 'single'::text]))),
    CONSTRAINT application_document_files_mime_check CHECK ((mime_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'application/pdf'::text]))),
    CONSTRAINT application_document_files_size_check CHECK (((size_bytes > 0) AND (size_bytes <= 5242880))),
    UNIQUE (document_id, side)
);

CREATE TABLE public.application_bank_accounts (
    bank_account_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id bigint NOT NULL REFERENCES public.rider_applications(application_id),
    account_enc text NOT NULL,
    account_hash character(64) NOT NULL,
    account_last4 character varying(4) NOT NULL,
    ifsc character varying(11) NOT NULL,
    holder_name character varying(100) NOT NULL,
    verified_name character varying(100),
    verification_status text DEFAULT 'Pending'::text NOT NULL,
    verified_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT application_bank_accounts_holder_check CHECK ((btrim((holder_name)::text) <> ''::text)),
    CONSTRAINT application_bank_accounts_status_check CHECK ((verification_status = ANY (ARRAY['Pending'::text, 'Verified'::text, 'Mismatch'::text, 'Failed'::text]))),
    CONSTRAINT application_bank_accounts_version_check CHECK ((version >= 1)),
    UNIQUE (application_id, version)
);

CREATE UNIQUE INDEX idx_application_bank_accounts_current ON public.application_bank_accounts USING btree (application_id)
    WHERE is_current;

CREATE INDEX idx_application_bank_accounts_hash ON public.application_bank_accounts USING btree (account_hash);

CREATE TABLE public.policy_versions (
    policy_version_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version integer NOT NULL UNIQUE,
    title character varying(150) NOT NULL,
    body text NOT NULL,
    effective_from date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT policy_versions_text_check CHECK (((btrim((title)::text) <> ''::text) AND (btrim(body) <> ''::text)))
);

-- Placeholder until admins can edit policies.
INSERT INTO public.policy_versions (version, title, body, effective_from)
VALUES (1, 'Rider policies', 'Placeholder policy text. Replace before going live.', '2000-01-01');

-- The prices shown when the rider accepted, so a later price change can be explained.
CREATE TABLE public.policy_acceptances (
    acceptance_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id bigint NOT NULL REFERENCES public.rider_applications(application_id),
    policy_version_id bigint NOT NULL REFERENCES public.policy_versions(policy_version_id),
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    ip character varying(64),
    device_info character varying(200),
    postpaid_rate_id bigint REFERENCES public.postpaid_rates(rate_id),
    deposit_id bigint REFERENCES public.deposit_amounts(deposit_id),
    prepaid_pack_id bigint REFERENCES public.prepaid_packs(pack_id),
    UNIQUE (application_id, policy_version_id)
);

CREATE TABLE public.application_events (
    event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id bigint NOT NULL REFERENCES public.rider_applications(application_id),
    event_type text NOT NULL,
    from_status text,
    to_status text,
    actor_type text NOT NULL,
    actor_user_id bigint REFERENCES public.users(user_id),
    note character varying(500),
    data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT application_events_type_check CHECK ((btrim(event_type) <> ''::text)),
    CONSTRAINT application_events_actor_check CHECK ((((actor_type = 'user'::text) AND (actor_user_id IS NOT NULL)) OR ((actor_type = ANY (ARRAY['rider'::text, 'system'::text])) AND (actor_user_id IS NULL))))
);

CREATE INDEX idx_application_events_application ON public.application_events USING btree (application_id, created_at);

CREATE TABLE public.document_access_log (
    access_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES public.users(user_id),
    application_id bigint NOT NULL REFERENCES public.rider_applications(application_id),
    document_id bigint NOT NULL REFERENCES public.application_documents(document_id),
    file_id bigint NOT NULL REFERENCES public.application_document_files(file_id),
    ip character varying(64),
    accessed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_document_access_log_application ON public.document_access_log USING btree (application_id, accessed_at);

COMMIT;
