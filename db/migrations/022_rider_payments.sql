-- Onboarding payments after approval: the deposit, and for prepaid riders their first weekly pack.
--   rider_payments   one row per payment order the rider app starts (or an admin marks paid)
--   rider_deposits   the deposit each rider has with us; only Held is used until exit and refunds
-- The amount is always set by the server when the order is created: the deposit in effect that day,
-- or the chosen pack's price. An order is open for 30 minutes; a payment that arrives later is still
-- accepted, because the rider's money was taken.
-- Apply with: npm run db:migrate

BEGIN;

CREATE TABLE public.rider_payments (
    payment_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id character varying(40) NOT NULL UNIQUE,
    application_id bigint NOT NULL REFERENCES public.rider_applications(application_id),
    rider_id character varying(30) NOT NULL REFERENCES public.riders(rider_id),
    purpose text NOT NULL,
    amount numeric(10,2) NOT NULL,
    deposit_id bigint REFERENCES public.deposit_amounts(deposit_id),
    prepaid_pack_id bigint REFERENCES public.prepaid_packs(pack_id),
    status text DEFAULT 'Created'::text NOT NULL,
    idempotency_key character varying(100),
    expires_at timestamp with time zone NOT NULL,
    method text,
    gateway_payment_id character varying(100) UNIQUE,
    manual_reference character varying(100),
    marked_by_user_id bigint REFERENCES public.users(user_id),
    note character varying(500),
    failure_reason character varying(500),
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rider_payments_purpose_check CHECK ((purpose = ANY (ARRAY['Deposit'::text, 'PrepaidPack'::text]))),
    CONSTRAINT rider_payments_amount_check CHECK ((amount > (0)::numeric)),
    -- A deposit comes from a deposit amount, a pack payment from a pack.
    CONSTRAINT rider_payments_source_check CHECK ((((purpose = 'Deposit'::text) AND (deposit_id IS NOT NULL) AND (prepaid_pack_id IS NULL)) OR ((purpose = 'PrepaidPack'::text) AND (prepaid_pack_id IS NOT NULL) AND (deposit_id IS NULL)))),
    CONSTRAINT rider_payments_status_check CHECK ((status = ANY (ARRAY['Created'::text, 'Paid'::text, 'Failed'::text, 'Expired'::text]))),
    -- Paid through the gateway has its payment ID; paid by hand has the admin's reference.
    CONSTRAINT rider_payments_paid_check CHECK (((status <> 'Paid'::text) OR ((paid_at IS NOT NULL) AND (((method = 'Gateway'::text) AND (gateway_payment_id IS NOT NULL)) OR ((method = 'Manual'::text) AND (manual_reference IS NOT NULL) AND (marked_by_user_id IS NOT NULL)))))),
    CONSTRAINT rider_payments_method_check CHECK (((method IS NULL) OR (method = ANY (ARRAY['Gateway'::text, 'Manual'::text])))),
    CONSTRAINT rider_payments_failed_check CHECK (((status <> 'Failed'::text) OR (failure_reason IS NOT NULL))),
    UNIQUE (rider_id, idempotency_key)
);

-- At most one open order per payment, so a double tap cannot start two.
CREATE UNIQUE INDEX idx_rider_payments_open ON public.rider_payments USING btree (application_id, purpose)
    WHERE (status = 'Created'::text);

CREATE UNIQUE INDEX idx_rider_payments_manual_reference ON public.rider_payments USING btree (manual_reference)
    WHERE (manual_reference IS NOT NULL);

CREATE INDEX idx_rider_payments_application ON public.rider_payments USING btree (application_id, created_at);

CREATE TABLE public.rider_deposits (
    rider_deposit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rider_id character varying(30) NOT NULL UNIQUE REFERENCES public.riders(rider_id),
    payment_id bigint NOT NULL UNIQUE REFERENCES public.rider_payments(payment_id),
    amount numeric(10,2) NOT NULL,
    status text DEFAULT 'Held'::text NOT NULL,
    held_since timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rider_deposits_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT rider_deposits_status_check CHECK ((status = ANY (ARRAY['Held'::text, 'Refund Due'::text, 'Refunded'::text, 'Forfeited'::text])))
);

COMMIT;
