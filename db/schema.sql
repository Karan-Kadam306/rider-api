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
-- Name: idx_daily_km_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_km_status ON public.daily_km_records USING btree (status);


--
-- Name: idx_daily_km_usage_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_km_usage_date ON public.daily_km_records USING btree (usage_date);


--
-- Name: idx_rider_inactive_periods_rider_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rider_inactive_periods_rider_dates ON public.rider_inactive_periods USING btree (rider_id, start_date, end_date);


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
-- Name: rider_inactive_periods rider_inactive_periods_rider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rider_inactive_periods
    ADD CONSTRAINT rider_inactive_periods_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.riders(rider_id);


--
-- PostgreSQL database dump complete
--

\unrestrict PtW6fvesNZWfOS4ecA0pB2JEcJLwHlrOilAJopV3O6XpxUtZ7xDzbP5FldMV9um

