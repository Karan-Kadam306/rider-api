-- Adds the Document Hub import log (one row per uploaded file, plus its failed rows)
-- and the indexes that keep the paginated lists fast as riders and bikes grow.
-- Run once against an existing database: psql "$DATABASE_URL" -f db/migrations/002_import_batches.sql

BEGIN;

-- One uploaded file. Only the upload details are kept, never the file itself.
CREATE TABLE public.import_batches (
    import_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_type text NOT NULL,
    file_name text NOT NULL,
    file_size_bytes integer NOT NULL,
    work_date date,
    status text NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    success_rows integer DEFAULT 0 NOT NULL,
    failed_rows integer DEFAULT 0 NOT NULL,
    -- Type-specific counts, e.g. Daily KM: inserted / unchanged / corrected / needsReview.
    result_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    -- Why the whole file was rejected (bad headers, unreadable CSV, ...).
    error_message text,
    -- Filled in once authentication exists (Phase 4).
    uploaded_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT import_batches_status_check CHECK ((status = ANY (ARRAY['Completed'::text, 'Partial'::text, 'Failed'::text]))),
    CONSTRAINT import_batches_counts_check CHECK (((file_size_bytes >= 0) AND (success_rows >= 0) AND (failed_rows >= 0) AND ((success_rows + failed_rows) = total_rows))),
    -- Status must agree with the row counts.
    CONSTRAINT import_batches_status_counts_check CHECK ((
        ((status = 'Completed'::text) AND (failed_rows = 0))
        OR ((status = 'Partial'::text) AND (success_rows > 0) AND (failed_rows > 0))
        OR ((status = 'Failed'::text) AND (success_rows = 0))
    ))
);

-- A row from the file that could not be imported, with the reason.
CREATE TABLE public.import_row_errors (
    error_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_id bigint NOT NULL REFERENCES public.import_batches(import_id) ON DELETE CASCADE,
    -- Line number in the file, counting the header as line 1.
    row_number integer NOT NULL,
    row_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text NOT NULL,
    CONSTRAINT import_row_errors_row_number_check CHECK ((row_number > 1)),
    CONSTRAINT import_row_errors_import_row_key UNIQUE (import_id, row_number)
);

-- Import History: newest first, optionally filtered by type.
CREATE INDEX idx_import_batches_created ON public.import_batches USING btree (created_at DESC);
CREATE INDEX idx_import_batches_type_created ON public.import_batches USING btree (import_type, created_at DESC);

-- Rider and bike lists filter by status and page in a fixed order.
CREATE INDEX idx_riders_status_created ON public.riders USING btree (status, created_at DESC);
CREATE INDEX idx_bikes_status ON public.bikes USING btree (status, bike_id);

-- Daily KM list filters by status over a date range; this replaces the status-only index.
DROP INDEX public.idx_daily_km_status;
CREATE INDEX idx_daily_km_status_usage_date ON public.daily_km_records USING btree (status, usage_date);

COMMIT;
