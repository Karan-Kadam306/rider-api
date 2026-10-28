-- Adds closed billing weeks and the per-rider bill snapshot taken at close.
-- Run once against an existing database: psql "$DATABASE_URL" -f db/migrations/001_billing_week_closures.sql

BEGIN;

CREATE TABLE public.billing_week_closures (
    week_start date PRIMARY KEY,
    total_amount numeric(12,2) NOT NULL,
    closed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_week_closures_monday_check CHECK ((EXTRACT(isodow FROM week_start) = (1)::numeric))
);

CREATE TABLE public.billing_week_snapshots (
    week_start date NOT NULL REFERENCES public.billing_week_closures(week_start),
    rider_id character varying(30) NOT NULL REFERENCES public.riders(rider_id),
    rental_days integer NOT NULL,
    total_rental numeric(10,2) NOT NULL,
    total_km numeric(10,2) NOT NULL,
    total_energy_charge numeric(10,2) NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    PRIMARY KEY (week_start, rider_id)
);

COMMIT;
