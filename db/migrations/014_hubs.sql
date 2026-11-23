-- Adds hubs: the locations riders join at and bikes are kept at. Every bike belongs to one hub.
-- Existing bikes go to a "Main Hub"; an admin can rename it and fill in the address on Hub Management.
-- Apply with: npm run db:migrate

BEGIN;

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

-- Hub names are picked from dropdowns, so two hubs cannot share one.
CREATE UNIQUE INDEX idx_hubs_name ON public.hubs USING btree (lower((name)::text));

INSERT INTO public.hubs (name, city, address)
SELECT 'Main Hub', 'Pune', 'Update this address on Hub Management'
WHERE EXISTS (SELECT 1 FROM public.bikes);

ALTER TABLE public.bikes ADD COLUMN hub_id bigint REFERENCES public.hubs(hub_id);
UPDATE public.bikes SET hub_id = (SELECT hub_id FROM public.hubs WHERE name = 'Main Hub');
ALTER TABLE public.bikes ALTER COLUMN hub_id SET NOT NULL;

CREATE INDEX idx_bikes_hub ON public.bikes USING btree (hub_id, status);

COMMIT;
