-- Adds configurable pricing, set by admins on the Configuration page:
--   postpaid_rates  daily rental and per-KM energy for postpaid riders, by effective date
--   deposit_amounts the refundable deposit every new rider pays, by effective date
--   prepaid_packs   weekly packs and KM top-ups prepaid riders buy
-- A price change adds a row and never edits an old one, so weeks already billed keep their numbers.
-- The first postpaid rate is today's ₹59/day and ₹1.50/km, in effect for all existing data.
-- Apply with: npm run db:migrate

BEGIN;

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

-- A weekly pack always lasts 7 days; a top-up lasts up to 7 and never past the weekly pack's end.
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

COMMIT;
