--
-- PostgreSQL database dump
--

\restrict PtW6fvesNZWfOS4ecA0pB2JEcJLwHlrOilAJopV3O6XpxUtZ7xDzbP5FldMV9um

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: bike_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bike_assignments (
    assignment_id bigint NOT NULL,
    bike_id bigint NOT NULL,
    rider_id character varying NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    returned_at timestamp with time zone
);


--
-- Name: bike_assignments_assignment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.bike_assignments ALTER COLUMN assignment_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.bike_assignments_assignment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: bikes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bikes (
    bike_id bigint NOT NULL,
    registration_number text,
    chassis_number text NOT NULL,
    status text DEFAULT 'Available'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bikes_status_check CHECK ((status = ANY (ARRAY['Available'::text, 'Assigned'::text, 'Maintenance'::text])))
);


--
-- Name: bikes_bike_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.bikes ALTER COLUMN bike_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.bikes_bike_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: billing_week_closures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_week_closures (
    week_start date NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    closed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_week_closures_monday_check CHECK ((EXTRACT(isodow FROM week_start) = (1)::numeric))
);


--
-- Name: billing_week_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_week_snapshots (
    week_start date NOT NULL,
    rider_id character varying(30) NOT NULL,
    rental_days integer NOT NULL,
    total_rental numeric(10,2) NOT NULL,
    total_km numeric(10,2) NOT NULL,
    total_energy_charge numeric(10,2) NOT NULL,
    total_amount numeric(10,2) NOT NULL
);


--
-- Name: daily_km_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_km_audit (
    audit_id bigint NOT NULL,
    km_record_id bigint NOT NULL,
    previous_daily_km numeric(10,2) NOT NULL,
    corrected_daily_km numeric(10,2) NOT NULL,
    previous_source_file text NOT NULL,
    corrected_source_file text NOT NULL,
    correction_reason text NOT NULL,
    corrected_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: daily_km_audit_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.daily_km_audit ALTER COLUMN audit_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.daily_km_audit_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: daily_km_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_km_records (
    km_record_id bigint NOT NULL,
    reported_vin text NOT NULL,
    bike_id bigint,
    usage_date date NOT NULL,
    daily_km numeric(10,2) NOT NULL,
    rider_id character varying,
    status text DEFAULT 'Needs Review'::text NOT NULL,
    source_file_name text NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT daily_km_records_daily_km_check CHECK ((daily_km >= (0)::numeric)),
    CONSTRAINT daily_km_records_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Validated'::text, 'Needs Review'::text])))
);


--
-- Name: daily_km_records_km_record_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.daily_km_records ALTER COLUMN km_record_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.daily_km_records_km_record_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idempotency_keys (
    client_id text NOT NULL,
    key text NOT NULL,
    request_hash text NOT NULL,
    status text NOT NULL,
    response_status integer,
    response_body jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT idempotency_keys_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'done'::text])))
);


--
-- Name: import_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_batches (
    import_id bigint NOT NULL,
    import_type text NOT NULL,
    file_name text NOT NULL,
    file_size_bytes integer NOT NULL,
    work_date date,
    status text NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    success_rows integer DEFAULT 0 NOT NULL,
    failed_rows integer DEFAULT 0 NOT NULL,
    result_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text,
    uploaded_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT import_batches_status_check CHECK ((status = ANY (ARRAY['Completed'::text, 'Partial'::text, 'Failed'::text]))),
    CONSTRAINT import_batches_counts_check CHECK (((file_size_bytes >= 0) AND (success_rows >= 0) AND (failed_rows >= 0) AND ((success_rows + failed_rows) = total_rows))),
    CONSTRAINT import_batches_status_counts_check CHECK ((((status = 'Completed'::text) AND (failed_rows = 0)) OR ((status = 'Partial'::text) AND (success_rows > 0) AND (failed_rows > 0)) OR ((status = 'Failed'::text) AND (success_rows = 0))))
);


--
-- Name: import_batches_import_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.import_batches ALTER COLUMN import_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.import_batches_import_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: import_row_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_row_errors (
    error_id bigint NOT NULL,
    import_id bigint NOT NULL,
    row_number integer NOT NULL,
    row_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text NOT NULL,
    CONSTRAINT import_row_errors_row_number_check CHECK ((row_number > 1))
);


--
-- Name: import_row_errors_error_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.import_row_errors ALTER COLUMN error_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.import_row_errors_error_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: rider_inactive_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rider_inactive_periods (
    inactive_period_id bigint NOT NULL,
    rider_id character varying NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    approved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT valid_inactive_period CHECK ((end_date >= start_date))
);


--
-- Name: rider_inactive_periods_inactive_period_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.rider_inactive_periods ALTER COLUMN inactive_period_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.rider_inactive_periods_inactive_period_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: riders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.riders (
    rider_id character varying(30) NOT NULL,
    name character varying(100) NOT NULL,
    phone character varying(15) NOT NULL,
    status character varying(20) DEFAULT 'Active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    terminated_on date
);


--
-- Name: bike_assignments bike_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bike_assignments
    ADD CONSTRAINT bike_assignments_pkey PRIMARY KEY (assignment_id);


--
-- Name: bikes bikes_chassis_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bikes
    ADD CONSTRAINT bikes_chassis_number_key UNIQUE (chassis_number);


--
-- Name: bikes bikes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bikes
    ADD CONSTRAINT bikes_pkey PRIMARY KEY (bike_id);


--
-- Name: bikes bikes_registration_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bikes
    ADD CONSTRAINT bikes_registration_number_key UNIQUE (registration_number);


--
-- Name: billing_week_closures billing_week_closures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_week_closures
    ADD CONSTRAINT billing_week_closures_pkey PRIMARY KEY (week_start);


--
-- Name: billing_week_snapshots billing_week_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_week_snapshots
    ADD CONSTRAINT billing_week_snapshots_pkey PRIMARY KEY (week_start, rider_id);


--
-- Name: daily_km_audit daily_km_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_km_audit
    ADD CONSTRAINT daily_km_audit_pkey PRIMARY KEY (audit_id);


--
-- Name: daily_km_records daily_km_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_km_records
    ADD CONSTRAINT daily_km_records_pkey PRIMARY KEY (km_record_id);


--
-- Name: idempotency_keys idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (client_id, key);


--
-- Name: import_batches import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_batches
    ADD CONSTRAINT import_batches_pkey PRIMARY KEY (import_id);


--
-- Name: import_row_errors import_row_errors_import_row_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_row_errors
    ADD CONSTRAINT import_row_errors_import_row_key UNIQUE (import_id, row_number);


--
-- Name: import_row_errors import_row_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_row_errors
    ADD CONSTRAINT import_row_errors_pkey PRIMARY KEY (error_id);


--
-- Name: rider_inactive_periods rider_inactive_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rider_inactive_periods
    ADD CONSTRAINT rider_inactive_periods_pkey PRIMARY KEY (inactive_period_id);


--
-- Name: riders riders_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.riders
    ADD CONSTRAINT riders_phone_key UNIQUE (phone);


--
-- Name: riders riders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.riders
    ADD CONSTRAINT riders_pkey PRIMARY KEY (rider_id);


--
-- Name: daily_km_records unique_vin_usage_date; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_km_records
    ADD CONSTRAINT unique_vin_usage_date UNIQUE (reported_vin, usage_date);


--
-- Name: idx_daily_km_audit_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_km_audit_record ON public.daily_km_audit USING btree (km_record_id);


--
-- Name: idx_bikes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bikes_status ON public.bikes USING btree (status, bike_id);


--
-- Name: idx_daily_km_status_usage_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_km_status_usage_date ON public.daily_km_records USING btree (status, usage_date);


--
-- Name: idx_daily_km_usage_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_km_usage_date ON public.daily_km_records USING btree (usage_date);


--
-- Name: idx_import_batches_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_batches_created ON public.import_batches USING btree (created_at DESC);


--
-- Name: idx_import_batches_type_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_batches_type_created ON public.import_batches USING btree (import_type, created_at DESC);


--
-- Name: idx_rider_inactive_periods_rider_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rider_inactive_periods_rider_dates ON public.rider_inactive_periods USING btree (rider_id, start_date, end_date);


--
-- Name: idx_riders_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_riders_status_created ON public.riders USING btree (status, created_at DESC);


--
-- Name: one_active_assignment_per_bike; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX one_active_assignment_per_bike ON public.bike_assignments USING btree (bike_id) WHERE (returned_at IS NULL);


--
-- Name: bike_assignments bike_assignments_bike_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bike_assignments
    ADD CONSTRAINT bike_assignments_bike_id_fkey FOREIGN KEY (bike_id) REFERENCES public.bikes(bike_id);


--
-- Name: bike_assignments bike_assignments_rider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bike_assignments
    ADD CONSTRAINT bike_assignments_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.riders(rider_id);


--
-- Name: billing_week_snapshots billing_week_snapshots_rider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_week_snapshots
    ADD CONSTRAINT billing_week_snapshots_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.riders(rider_id);


--
-- Name: billing_week_snapshots billing_week_snapshots_week_start_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_week_snapshots
    ADD CONSTRAINT billing_week_snapshots_week_start_fkey FOREIGN KEY (week_start) REFERENCES public.billing_week_closures(week_start);


--
-- Name: daily_km_audit daily_km_audit_km_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_km_audit
    ADD CONSTRAINT daily_km_audit_km_record_id_fkey FOREIGN KEY (km_record_id) REFERENCES public.daily_km_records(km_record_id);


--
-- Name: daily_km_records daily_km_records_bike_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_km_records
    ADD CONSTRAINT daily_km_records_bike_id_fkey FOREIGN KEY (bike_id) REFERENCES public.bikes(bike_id);


--
-- Name: daily_km_records daily_km_records_rider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_km_records
    ADD CONSTRAINT daily_km_records_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.riders(rider_id);


--
-- Name: import_row_errors import_row_errors_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_row_errors
    ADD CONSTRAINT import_row_errors_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.import_batches(import_id) ON DELETE CASCADE;


--
-- Name: rider_inactive_periods rider_inactive_periods_rider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rider_inactive_periods
    ADD CONSTRAINT rider_inactive_periods_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.riders(rider_id);


--
-- Payouts (added by db/migrations/003_payouts.sql)
--

CREATE TABLE public.payout_runs (
    run_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    week_start date NOT NULL,
    run_number integer NOT NULL,
    rider_count integer NOT NULL,
    updated_count integer NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    triggered_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payout_runs_monday_check CHECK ((EXTRACT(isodow FROM week_start) = (1)::numeric)),
    CONSTRAINT payout_runs_counts_check CHECK (((run_number > 0) AND (rider_count >= 0) AND (updated_count >= 0))),
    CONSTRAINT payout_runs_week_run_key UNIQUE (week_start, run_number)
);

CREATE TABLE public.payout_items (
    week_start date NOT NULL,
    rider_id character varying(30) NOT NULL REFERENCES public.riders(rider_id),
    rental_days integer NOT NULL,
    total_rental numeric(10,2) NOT NULL,
    total_km numeric(10,2) NOT NULL,
    total_energy_charge numeric(10,2) NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    previous_total_amount numeric(10,2),
    first_run_id bigint NOT NULL REFERENCES public.payout_runs(run_id),
    updated_run_id bigint NOT NULL REFERENCES public.payout_runs(run_id),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (week_start, rider_id)
);

CREATE INDEX idx_payout_runs_triggered ON public.payout_runs USING btree (triggered_at DESC);


--
-- Users and sessions (added by db/migrations/004_auth.sql)
--

CREATE TABLE public.users (
    user_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email character varying(254) NOT NULL,
    name character varying(100) NOT NULL,
    password_hash text NOT NULL,
    role character varying(20) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone,
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_email_lowercase_check CHECK (((email)::text = lower((email)::text))),
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'team_leader'::character varying])::text[])))
);

CREATE TABLE public.sessions (
    token_hash character(64) PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);

CREATE INDEX idx_sessions_user ON public.sessions USING btree (user_id);

-- Failed sign-ins (added by db/migrations/005_login_failures.sql)

CREATE TABLE public.login_failures (
    login_failure_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email character varying(254) NOT NULL,
    ip_address character varying(45) NOT NULL,
    failed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_login_failures_email ON public.login_failures USING btree (email, failed_at);
CREATE INDEX idx_login_failures_ip ON public.login_failures USING btree (ip_address, failed_at);

-- Partners and partner earnings (added by db/migrations/006_partner_earnings.sql)

CREATE TABLE public.partners (
    partner_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code character varying(30) NOT NULL UNIQUE,
    name character varying(100) NOT NULL UNIQUE,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO public.partners (code, name) VALUES
    ('bigbasket', 'BigBasket'),
    ('blinkit', 'Blinkit'),
    ('instamart', 'Instamart'),
    ('porter', 'Porter'),
    ('zepto', 'Zepto'),
    ('zomato', 'Zomato India Pvt Ltd');

CREATE TABLE public.rider_partner_mappings (
    mapping_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rider_id character varying(30) NOT NULL REFERENCES public.riders(rider_id),
    partner_id integer NOT NULL REFERENCES public.partners(partner_id),
    partner_rider_id character varying(100) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deactivated_at timestamp with time zone,
    CONSTRAINT rider_partner_mappings_id_format_check CHECK (((partner_rider_id)::text <> ''::text) AND ((partner_rider_id)::text = upper(btrim((partner_rider_id)::text)))),
    CONSTRAINT rider_partner_mappings_active_check CHECK ((is_active = (deactivated_at IS NULL)))
);

CREATE UNIQUE INDEX idx_rider_partner_mappings_active_id ON public.rider_partner_mappings USING btree (partner_id, partner_rider_id) WHERE is_active;
CREATE UNIQUE INDEX idx_rider_partner_mappings_active_rider ON public.rider_partner_mappings USING btree (partner_id, rider_id) WHERE is_active;
CREATE INDEX idx_rider_partner_mappings_rider ON public.rider_partner_mappings USING btree (rider_id);

ALTER TABLE public.import_batches
    ADD COLUMN partner_id integer REFERENCES public.partners(partner_id),
    ADD CONSTRAINT import_batches_partner_check CHECK (((import_type = 'partner_earnings'::text) = (partner_id IS NOT NULL)));

CREATE TABLE public.partner_earnings (
    earning_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    partner_id integer NOT NULL REFERENCES public.partners(partner_id),
    partner_rider_id character varying(100) NOT NULL,
    earning_date date NOT NULL,
    amount numeric(10,2) NOT NULL,
    status text NOT NULL,
    rider_id character varying(30) REFERENCES public.riders(rider_id),
    name_in_file text,
    dismiss_reason text,
    import_id bigint NOT NULL REFERENCES public.import_batches(import_id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT partner_earnings_entry_key UNIQUE (partner_id, partner_rider_id, earning_date),
    CONSTRAINT partner_earnings_id_format_check CHECK (((partner_rider_id)::text <> ''::text) AND ((partner_rider_id)::text = upper(btrim((partner_rider_id)::text)))),
    CONSTRAINT partner_earnings_status_check CHECK ((status = ANY (ARRAY['Matched'::text, 'Pending'::text, 'Dismissed'::text]))),
    CONSTRAINT partner_earnings_rider_check CHECK (((status = 'Matched'::text) = (rider_id IS NOT NULL))),
    CONSTRAINT partner_earnings_dismiss_check CHECK (((status = 'Dismissed'::text) = (dismiss_reason IS NOT NULL)))
);

CREATE INDEX idx_partner_earnings_rider_date ON public.partner_earnings USING btree (rider_id, earning_date);
CREATE INDEX idx_partner_earnings_status_date ON public.partner_earnings USING btree (status, earning_date);

ALTER TABLE public.payout_items
    ADD COLUMN total_earnings numeric(10,2),
    ADD COLUMN net_payout numeric(10,2);

ALTER TABLE public.payout_runs
    ADD COLUMN total_earnings numeric(12,2),
    ADD COLUMN total_net_payout numeric(12,2);

-- Audit users (added by db/migrations/007_audit_users.sql)

ALTER TABLE public.import_batches
    ALTER COLUMN uploaded_by TYPE bigint USING uploaded_by::bigint,
    ADD CONSTRAINT import_batches_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(user_id);

ALTER TABLE public.rider_partner_mappings
    ADD COLUMN created_by bigint REFERENCES public.users(user_id),
    ADD COLUMN deactivated_by bigint REFERENCES public.users(user_id);

ALTER TABLE public.partner_earnings
    ADD COLUMN reviewed_by bigint REFERENCES public.users(user_id),
    ADD COLUMN reviewed_at timestamp with time zone;

-- Rider escalations (added by db/migrations/008_rider_escalations.sql)

CREATE TABLE public.rider_escalations (
    escalation_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rider_id character varying(30) NOT NULL REFERENCES public.riders(rider_id),
    kind text NOT NULL,
    reasons text[] NOT NULL,
    comment text,
    amount numeric(10,2),
    week_start date NOT NULL,
    status text DEFAULT 'Open'::text NOT NULL,
    lock_status text,
    bike_id bigint REFERENCES public.bikes(bike_id),
    lock_ref text,
    payment_token text UNIQUE,
    payment_ref text UNIQUE,
    resolution_note text,
    resolved_at timestamp with time zone,
    resolved_by bigint REFERENCES public.users(user_id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint REFERENCES public.users(user_id),
    CONSTRAINT rider_escalations_kind_check CHECK ((kind = ANY (ARRAY['Charge'::text, 'Collection'::text, 'Record'::text]))),
    CONSTRAINT rider_escalations_reasons_check CHECK (((cardinality(reasons) > 0) AND (reasons <@ ARRAY['Payment Due'::text, 'SOP Violation'::text, 'Attendance Issues'::text, 'Safety Concern'::text, 'Customer Complaint'::text, 'Document Non-Compliance'::text, 'Bike Misuse'::text, 'Partner Deactivation'::text, 'Policy Violation'::text, 'Other'::text]))),
    CONSTRAINT rider_escalations_kind_reasons_check CHECK (((kind = 'Collection'::text) = ('Payment Due'::text = ANY (reasons)))),
    CONSTRAINT rider_escalations_comment_check CHECK ((('Other'::text <> ALL (reasons)) OR (btrim(comment) <> ''::text))),
    CONSTRAINT rider_escalations_amount_check CHECK (((kind = 'Record'::text) = (amount IS NULL)) AND ((amount IS NULL) OR (amount > (0)::numeric))),
    CONSTRAINT rider_escalations_record_check CHECK ((((kind = 'Record'::text) = (payment_token IS NULL)) AND ((kind = 'Record'::text) = (lock_status IS NULL)))),
    CONSTRAINT rider_escalations_monday_check CHECK ((EXTRACT(isodow FROM week_start) = (1)::numeric)),
    CONSTRAINT rider_escalations_status_check CHECK ((status = ANY (ARRAY['Open'::text, 'Paid'::text, 'Waived'::text, 'Recovered'::text, 'Closed'::text]))),
    CONSTRAINT rider_escalations_status_kind_check CHECK ((((status = 'Recovered'::text) <= (kind = 'Charge'::text)) AND ((status = 'Closed'::text) <= (kind = 'Record'::text)) AND ((status = ANY (ARRAY['Paid'::text, 'Waived'::text])) <= (kind <> 'Record'::text)))),
    CONSTRAINT rider_escalations_lock_status_check CHECK ((lock_status = ANY (ARRAY['Locked'::text, 'Unlocked'::text, 'NoBike'::text, 'Failed'::text, 'Skipped'::text]))),
    CONSTRAINT rider_escalations_resolved_check CHECK (((status = 'Open'::text) = (resolved_at IS NULL)))
);

CREATE UNIQUE INDEX idx_rider_escalations_open_rider ON public.rider_escalations USING btree (rider_id) WHERE ((status = 'Open'::text) AND (kind <> 'Record'::text));
CREATE INDEX idx_rider_escalations_rider ON public.rider_escalations USING btree (rider_id, created_at DESC);
CREATE INDEX idx_rider_escalations_week_status ON public.rider_escalations USING btree (week_start, status);
CREATE INDEX idx_rider_escalations_locked_bike ON public.rider_escalations USING btree (bike_id) WHERE (lock_status = 'Locked'::text);

CREATE TABLE public.escalation_events (
    event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    escalation_id bigint NOT NULL REFERENCES public.rider_escalations(escalation_id),
    event_type text NOT NULL,
    detail jsonb,
    user_id bigint REFERENCES public.users(user_id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT escalation_events_type_check CHECK ((event_type = ANY (ARRAY['Raised'::text, 'BikeLocked'::text, 'LockFailed'::text, 'LinkSent'::text, 'Paid'::text, 'MarkedPaid'::text, 'Waived'::text, 'Recovered'::text, 'Closed'::text, 'BikeUnlocked'::text, 'UnlockFailed'::text, 'LockSkipped'::text])))
);

CREATE INDEX idx_escalation_events_escalation ON public.escalation_events USING btree (escalation_id, created_at);

ALTER TABLE public.payout_items
    ADD COLUMN escalation_charges numeric(10,2),
    ADD COLUMN balance_cleared numeric(10,2);

-- Earnings row errors (added by db/migrations/009_earnings_row_errors.sql; it also drops the amount >= 0 check)

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

-- Earnings history and ignored IDs (added by db/migrations/010_earnings_controls.sql)

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

CREATE TABLE public.partner_ignored_ids (
    partner_id integer NOT NULL REFERENCES public.partners(partner_id),
    partner_rider_id character varying(100) NOT NULL,
    reason text NOT NULL,
    created_by bigint REFERENCES public.users(user_id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (partner_id, partner_rider_id)
);

--
-- Team leaders (added by db/migrations/011_team_leaders.sql; it also adds team_leader to users_role_check)
--

CREATE TABLE public.team_leader_riders (
    link_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES public.users(user_id),
    rider_id character varying(30) NOT NULL REFERENCES public.riders(rider_id),
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_by bigint REFERENCES public.users(user_id),
    removed_at timestamp with time zone,
    removed_by bigint REFERENCES public.users(user_id),
    CONSTRAINT team_leader_riders_removed_check CHECK (((removed_at IS NULL) = (removed_by IS NULL)))
);

CREATE UNIQUE INDEX idx_team_leader_riders_active ON public.team_leader_riders USING btree (user_id, rider_id) WHERE (removed_at IS NULL);
CREATE INDEX idx_team_leader_riders_rider ON public.team_leader_riders USING btree (rider_id) WHERE (removed_at IS NULL);

--
-- Rider follow-ups (added by db/migrations/012_rider_follow_ups.sql)
--

CREATE TABLE public.rider_follow_ups (
    follow_up_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rider_id character varying(30) NOT NULL REFERENCES public.riders(rider_id),
    user_id bigint NOT NULL REFERENCES public.users(user_id),
    escalation_id bigint REFERENCES public.rider_escalations(escalation_id),
    reason text NOT NULL,
    outcome text NOT NULL,
    note text NOT NULL,
    promise_date date,
    promise_amount numeric(10,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rider_follow_ups_reason_check CHECK ((reason = ANY (ARRAY['Payment Due'::text, 'Performance'::text, 'Attendance'::text, 'Other'::text]))),
    CONSTRAINT rider_follow_ups_outcome_check CHECK ((outcome = ANY (ARRAY['Promised to Pay'::text, 'Paid'::text, 'Unreachable'::text, 'Refused'::text, 'Will Improve'::text, 'Other'::text]))),
    CONSTRAINT rider_follow_ups_note_check CHECK (((btrim(note) <> ''::text) AND (length(note) <= 1000))),
    CONSTRAINT rider_follow_ups_promise_check CHECK ((((outcome = 'Promised to Pay'::text) = (promise_date IS NOT NULL)) AND ((promise_amount IS NULL) OR ((outcome = 'Promised to Pay'::text) AND (promise_amount > (0)::numeric)))))
);

CREATE INDEX idx_rider_follow_ups_rider ON public.rider_follow_ups USING btree (rider_id, created_at DESC);

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

--
-- Hubs (added by db/migrations/014_hubs.sql; it also adds bikes.hub_id)
--

CREATE TABLE public.hubs (
    hub_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name character varying(100) NOT NULL,
    city character varying(60) NOT NULL,
    address character varying(300) NOT NULL,
    contact_phone character varying(15),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hubs_text_check CHECK (((btrim((name)::text) <> ''::text) AND (btrim((city)::text) <> ''::text) AND (btrim((address)::text) <> ''::text)))
);

CREATE UNIQUE INDEX idx_hubs_name ON public.hubs USING btree (lower((name)::text));

ALTER TABLE public.bikes ADD COLUMN hub_id bigint NOT NULL REFERENCES public.hubs(hub_id);

CREATE INDEX idx_bikes_hub ON public.bikes USING btree (hub_id, status);

--
-- Pricing (added by db/migrations/015_pricing.sql)
--

CREATE TABLE public.postpaid_rates (
    rate_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rental_per_day numeric(10,2) NOT NULL,
    energy_per_km numeric(10,2) NOT NULL,
    effective_from date NOT NULL UNIQUE,
    created_by bigint REFERENCES public.users(user_id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT postpaid_rates_amounts_check CHECK (((rental_per_day > (0)::numeric) AND (energy_per_km >= (0)::numeric)))
);

INSERT INTO public.postpaid_rates (rental_per_day, energy_per_km, effective_from)
VALUES (59.00, 1.50, '2000-01-01');

CREATE TABLE public.deposit_amounts (
    deposit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    amount numeric(10,2) NOT NULL,
    effective_from date NOT NULL UNIQUE,
    created_by bigint REFERENCES public.users(user_id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deposit_amounts_amount_check CHECK ((amount > (0)::numeric))
);

CREATE TABLE public.prepaid_packs (
    pack_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind text NOT NULL,
    name character varying(100) NOT NULL,
    price numeric(10,2) NOT NULL,
    km_included integer NOT NULL,
    validity_days integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by bigint REFERENCES public.users(user_id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT prepaid_packs_kind_check CHECK ((kind = ANY (ARRAY['Weekly'::text, 'TopUp'::text]))),
    CONSTRAINT prepaid_packs_name_check CHECK ((btrim((name)::text) <> ''::text)),
    CONSTRAINT prepaid_packs_amounts_check CHECK (((price > (0)::numeric) AND (km_included > 0))),
    CONSTRAINT prepaid_packs_validity_check CHECK (((validity_days >= 1) AND (validity_days <= 7) AND ((kind <> 'Weekly'::text) OR (validity_days = 7))))
);

CREATE UNIQUE INDEX idx_prepaid_packs_name ON public.prepaid_packs USING btree (lower((name)::text));

--
-- Rider applications (added by db/migrations/016_rider_applications.sql)
--

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

--
-- Rider app sign-in (added by db/migrations/017_rider_auth.sql)
--

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

--
-- Onboarding steps (added by db/migrations/018_onboarding_steps.sql)
--

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

--
-- PostgreSQL database dump complete
--

\unrestrict PtW6fvesNZWfOS4ecA0pB2JEcJLwHlrOilAJopV3O6XpxUtZ7xDzbP5FldMV9um

