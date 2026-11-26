-- Rider onboarding happens only in the rider app, so staff never fill in an application.
-- Drops rider_applications.assisted_by_user_id, which nothing ever wrote.
-- Apply with: npm run db:migrate

BEGIN;

ALTER TABLE public.rider_applications DROP COLUMN assisted_by_user_id;

COMMIT;
