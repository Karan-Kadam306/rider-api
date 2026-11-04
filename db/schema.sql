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
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::text[])))
);

CREATE TABLE public.sessions (
    token_hash character(64) PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);

CREATE INDEX idx_sessions_user ON public.sessions USING btree (user_id);


--
-- PostgreSQL database dump complete
--

\unrestrict PtW6fvesNZWfOS4ecA0pB2JEcJLwHlrOilAJopV3O6XpxUtZ7xDzbP5FldMV9um

