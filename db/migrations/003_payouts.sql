-- Adds weekly payouts. A payout saves every rider's bill for an ended week; it can be
-- triggered again after corrections, and only riders whose amounts changed are updated.
-- Run once against an existing database: psql "$DATABASE_URL" -f db/migrations/003_payouts.sql

BEGIN;

-- One trigger of a week's payout. Run 1 is the first payout; later runs apply corrections.
CREATE TABLE public.payout_runs (
    run_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    week_start date NOT NULL,
    run_number integer NOT NULL,
    -- Riders with a payout for the week after this run.
    rider_count integer NOT NULL,
    -- Riders added or changed by this run.
    updated_count integer NOT NULL,
    -- The week's payout total after this run.
    total_amount numeric(12,2) NOT NULL,
    triggered_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payout_runs_monday_check CHECK ((EXTRACT(isodow FROM week_start) = (1)::numeric)),
    CONSTRAINT payout_runs_counts_check CHECK (((run_number > 0) AND (rider_count >= 0) AND (updated_count >= 0))),
    CONSTRAINT payout_runs_week_run_key UNIQUE (week_start, run_number)
);

-- The current payout of one rider for one week.
CREATE TABLE public.payout_items (
    week_start date NOT NULL,
    rider_id character varying(30) NOT NULL REFERENCES public.riders(rider_id),
    rental_days integer NOT NULL,
    total_rental numeric(10,2) NOT NULL,
    total_km numeric(10,2) NOT NULL,
    total_energy_charge numeric(10,2) NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    -- The amount before the last change; null until a re-run changes it.
    previous_total_amount numeric(10,2),
    first_run_id bigint NOT NULL REFERENCES public.payout_runs(run_id),
    updated_run_id bigint NOT NULL REFERENCES public.payout_runs(run_id),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (week_start, rider_id)
);

-- Recent payouts across all weeks, newest first.
CREATE INDEX idx_payout_runs_triggered ON public.payout_runs USING btree (triggered_at DESC);

COMMIT;
