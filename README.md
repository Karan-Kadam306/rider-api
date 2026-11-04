# Rider API

Backend and admin panel for an electric-bike rental fleet: riders, bikes, bike assignments,
Daily KM uploads, weekly billing and weekly payouts.

- **Backend:** Node.js + Express 5 + PostgreSQL (`pg`), in the project root.
- **Admin panel:** React + Vite, in [`admin-ui/`](admin-ui/).

## Business rules

| Charge | Rule |
|---|---|
| Rental | ₹59 per calendar day (IST) on which the rider had at least one bike assigned. A bike swap on the same day is still one day. |
| Not charged | Days without a bike, days after the rider's termination date, days after today, and approved inactive days. |
| Energy | ₹1.50 per KM, from **Validated** Daily KM records only. A bike shared by two riders that day needs review first. |
| Billing week | Monday to Sunday. |
| Payout | Saves each rider's deductions (rental + energy) for an ended week. It can be re-triggered after corrections, and then only riders whose amounts changed are updated. |
| Close week | Saves the week's bills as billed. Later corrections are still allowed and show as changes since close. |

Rental and energy are **deductions** from the rider. Once rider earnings are imported,
a rider's net payout will be: **Earnings − Deductions**.

## Requirements

- Node.js 24
- PostgreSQL 18 (any recent version should work)

## Setup

1. Install the dependencies:

   ```bash
   npm install
   cd admin-ui && npm install && cd ..
   ```

2. Create the two databases, `rider_db` and `rider_test` (e.g. with pgAdmin or `createdb`).

3. Copy [`.env.example`](.env.example) to `.env` and set your database passwords.

4. Create the tables:

   ```bash
   # Main database: load the schema, then record the migrations it already contains.
   psql "$DATABASE_URL" -f db/schema.sql
   npm run db:migrate -- --baseline

   # Test database (drops and recreates rider_test).
   npm run db:test:setup
   ```

   Already have a database that was migrated by hand (001–003)? Run
   `npm run db:migrate -- --baseline` once to record them, then use `npm run db:migrate` from then on.

5. Create the first admin (there is no public sign-up):

   ```bash
   npm run user:create
   ```

## Running

Start the API and the admin panel in two terminals:

```bash
npm start                  # API on http://localhost:3000
cd admin-ui && npm run dev # Admin panel on http://127.0.0.1:5173
```

In development the admin panel sends `/api` calls to the API through Vite's proxy, so no
CORS setup is needed. See [`admin-ui/.env.example`](admin-ui/.env.example) for production.

## Sign-in and roles

Every `/api` route except `/api/auth/*` needs a signed-in user; `/health` stays public.
Signing in sets an `httpOnly`, `SameSite=Strict` session cookie (`Secure` when `NODE_ENV=production`).
Sessions are stored in the `sessions` table and last `SESSION_TTL_HOURS` (default 12).

| Role | Can do |
|---|---|
| `admin` | Everything, including closing a billing week and triggering payouts |
| `staff` | Everything else: riders, bikes, assignments, imports, Daily KM, viewing billing and payouts |

## Commands

| Command | What it does |
|---|---|
| `npm test` | All backend tests (unit + integration) against `rider_test` |
| `npm run test:unit` | Unit tests only, no database needed |
| `npm run test:coverage` | Tests with a coverage report |
| `npm run db:test:setup` | Drop and recreate `rider_test` from `db/schema.sql` |
| `npm run db:migrate` | Apply new files in `db/migrations` (prefix `NODE_ENV=test` for `rider_test`) |
| `npm run db:check` | Read-only data consistency check; reports problems, changes nothing |
| `npm run user:create` | Create an admin panel user (prompts for the password) |
| `npm run lint` (in `admin-ui`) | Lint the admin panel |
| `npm run build` (in `admin-ui`) | Production build of the admin panel |

## Adding a database change

1. Add a new file `db/migrations/00N_short_name.sql`.
2. Add the same change to `db/schema.sql`, so new and test databases get it.
3. Run `npm run db:migrate` (and `npm run db:test:setup` for the test database).

## Project layout

```
routes/        URL → controller
controllers/   HTTP in/out
services/      business rules
repositories/  SQL
middleware/    sign-in and role checks, request validation, uploads, error handling
utils/         pure calculations (rental, energy, payout diff)
db/            schema, migrations, migrate and check scripts
tests/         unit and integration tests (node:test)
admin-ui/      React admin panel
```

## Main API endpoints

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Riders | `GET/POST /api/riders`, `GET/PUT/DELETE /api/riders/:riderId`, `GET /api/riders/summary` |
| Inactive days | `GET/POST /api/riders/:riderId/inactive-periods`, `PATCH …/:periodId/approve`, `DELETE …/:periodId` |
| Bikes | `GET/POST /api/bikes`, `GET /api/bikes/summary`, `GET /api/bikes/:bikeId`, `PATCH /api/bikes/:bikeId/status`, `POST /api/bike-assignments` (needs an `Idempotency-Key` header), `POST /api/bikes/:bikeId/return`, `GET /api/bikes/:bikeId/assignments` |
| Imports | `GET /api/imports/types`, `GET /api/imports/summary`, `GET /api/imports`, `POST /api/imports` (CSV upload), `GET /api/imports/:importId` |
| Daily KM | `GET /api/daily-km`, `GET /api/daily-km/candidates`, `POST /api/daily-km/validate`, `PATCH /api/daily-km/:recordId/resolve` |
| Billing | `GET /api/billing/bills`, `GET /api/billing/bills/export`, `GET /api/billing/riders/:riderId`, `POST /api/billing/weeks/:weekStart/close` (admin) |
| Payouts | `GET /api/payouts/weeks/:weekStart`, `POST /api/payouts/weeks/:weekStart/run` (admin), `GET /api/payouts/recent` |
| Dashboard | `GET /api/dashboard?weekStart=YYYY-MM-DD` |
