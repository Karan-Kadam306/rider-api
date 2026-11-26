-- Finishes the hub and role groundwork for rider onboarding:
--   hubs.code, hubs.manager_name   a short code shown in lists and a named manager per hub
--   riders.hub_id                  the hub a rider joined at; every rider belongs to one hub
--   riders.is_test                 test riders, hidden from the riders list unless asked for
--   onboarding role                users who review and approve new riders
-- Existing riders go to the hub of the bike they hold or last held, or else the first hub.
-- Apply with: npm run db:migrate

BEGIN;

ALTER TABLE public.users DROP CONSTRAINT users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
    CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'team_leader'::character varying, 'onboarding'::character varying])::text[])));

-- Existing hubs get HUB01, HUB02, ... and an admin can change them on Hub Management.
ALTER TABLE public.hubs ADD COLUMN code character varying(10);
UPDATE public.hubs SET code = 'HUB' || lpad(hub_id::text, 2, '0');
ALTER TABLE public.hubs ALTER COLUMN code SET NOT NULL;
ALTER TABLE public.hubs ADD CONSTRAINT hubs_code_check CHECK (((code)::text ~ '^[A-Z0-9-]{2,10}$'));
CREATE UNIQUE INDEX idx_hubs_code ON public.hubs USING btree (code);

ALTER TABLE public.hubs ADD COLUMN manager_name character varying(100);

-- Riders without any hub yet (no bikes were ever added) need one to belong to.
INSERT INTO public.hubs (code, name, city, address)
SELECT 'MAIN', 'Main Hub', 'Pune', 'Update this address on Hub Management'
WHERE EXISTS (SELECT 1 FROM public.riders)
  AND NOT EXISTS (SELECT 1 FROM public.hubs);

ALTER TABLE public.riders ADD COLUMN hub_id bigint REFERENCES public.hubs(hub_id);

UPDATE public.riders r
SET hub_id = COALESCE(
    (SELECT b.hub_id
     FROM public.bike_assignments ba
     JOIN public.bikes b ON b.bike_id = ba.bike_id
     WHERE ba.rider_id = r.rider_id
     ORDER BY ba.assigned_at DESC
     LIMIT 1),
    (SELECT min(hub_id) FROM public.hubs)
);

ALTER TABLE public.riders ALTER COLUMN hub_id SET NOT NULL;
CREATE INDEX idx_riders_hub ON public.riders USING btree (hub_id, status);

ALTER TABLE public.riders ADD COLUMN is_test boolean DEFAULT false NOT NULL;

COMMIT;
