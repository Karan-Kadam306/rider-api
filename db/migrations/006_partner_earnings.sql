-- Adds delivery partners, the rider ID each partner uses, and earnings imported from partner sheets.
-- Apply with: npm run db:migrate

BEGIN;

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

-- Links a rider to the ID a partner knows them by. Old links are kept, marked inactive.
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

-- A partner ID belongs to one rider, and a rider has one ID per partner.
CREATE UNIQUE INDEX idx_rider_partner_mappings_active_id ON public.rider_partner_mappings USING btree (partner_id, partner_rider_id) WHERE is_active;
CREATE UNIQUE INDEX idx_rider_partner_mappings_active_rider ON public.rider_partner_mappings USING btree (partner_id, rider_id) WHERE is_active;
CREATE INDEX idx_rider_partner_mappings_rider ON public.rider_partner_mappings USING btree (rider_id);

-- Which partner a partner earnings file came from.
ALTER TABLE public.import_batches
    ADD COLUMN partner_id integer REFERENCES public.partners(partner_id),
    ADD CONSTRAINT import_batches_partner_check CHECK (((import_type = 'partner_earnings'::text) = (partner_id IS NOT NULL)));

-- One partner ID's earnings for one day. Weekly sheets are stored on the week's Monday.
CREATE TABLE public.partner_earnings (
    earning_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    partner_id integer NOT NULL REFERENCES public.partners(partner_id),
    partner_rider_id character varying(100) NOT NULL,
    earning_date date NOT NULL,
    amount numeric(10,2) NOT NULL,
    status text NOT NULL,
    rider_id character varying(30) REFERENCES public.riders(rider_id),
    -- The name printed in the sheet, to help whoever resolves an unknown ID.
    name_in_file text,
    dismiss_reason text,
    -- The last file that added or changed this row.
    import_id bigint NOT NULL REFERENCES public.import_batches(import_id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT partner_earnings_entry_key UNIQUE (partner_id, partner_rider_id, earning_date),
    CONSTRAINT partner_earnings_id_format_check CHECK (((partner_rider_id)::text <> ''::text) AND ((partner_rider_id)::text = upper(btrim((partner_rider_id)::text)))),
    CONSTRAINT partner_earnings_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT partner_earnings_status_check CHECK ((status = ANY (ARRAY['Matched'::text, 'Pending'::text, 'Dismissed'::text]))),
    CONSTRAINT partner_earnings_rider_check CHECK (((status = 'Matched'::text) = (rider_id IS NOT NULL))),
    CONSTRAINT partner_earnings_dismiss_check CHECK (((status = 'Dismissed'::text) = (dismiss_reason IS NOT NULL)))
);

CREATE INDEX idx_partner_earnings_rider_date ON public.partner_earnings USING btree (rider_id, earning_date);
CREATE INDEX idx_partner_earnings_status_date ON public.partner_earnings USING btree (status, earning_date);

-- Payouts made before this migration have no earnings, so these stay empty for them.
ALTER TABLE public.payout_items
    ADD COLUMN total_earnings numeric(10,2),
    ADD COLUMN net_payout numeric(10,2);

ALTER TABLE public.payout_runs
    ADD COLUMN total_earnings numeric(12,2),
    ADD COLUMN total_net_payout numeric(12,2);

COMMIT;
