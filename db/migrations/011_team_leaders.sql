-- Adds Team Leaders: users who follow up with their own riders on dues and performance.
-- A rider can have several team leaders; removing one keeps the row (removed_at) as history.
-- Apply with: npm run db:migrate

BEGIN;

ALTER TABLE public.users DROP CONSTRAINT users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
    CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'team_leader'::character varying])::text[])));

CREATE TABLE public.team_leader_riders (
    link_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES public.users(user_id),
    rider_id character varying(30) NOT NULL REFERENCES public.riders(rider_id),
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_by bigint REFERENCES public.users(user_id),
    removed_at timestamp with time zone,
    removed_by bigint REFERENCES public.users(user_id),
    CONSTRAINT team_leader_riders_removed_check CHECK (((removed_at IS NULL) = (removed_by IS NULL)))
);

-- A team leader holds a rider at most once at a time.
CREATE UNIQUE INDEX idx_team_leader_riders_active ON public.team_leader_riders USING btree (user_id, rider_id) WHERE (removed_at IS NULL);
CREATE INDEX idx_team_leader_riders_rider ON public.team_leader_riders USING btree (rider_id) WHERE (removed_at IS NULL);

COMMIT;
