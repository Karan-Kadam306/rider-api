# Rider API

Backend and admin panel for an electric-bike rental fleet: riders, bikes, bike assignments,
Daily KM uploads, weekly billing and weekly payouts.

- **Backend:** Node.js + Express 5 + PostgreSQL (`pg`), in the project root.
- **Admin panel:** React + Vite, in [`admin-ui/`](admin-ui/).

## Business rules

| Charge | Rule |
|---|---|
| Rental | The postpaid daily rate (₹59 to start; set on Configuration) per calendar day (IST) on which the rider had at least one bike assigned. A bike swap on the same day is still one day. Each day uses the rate in effect that day. |
| Not charged | Days without a bike, days after the rider's termination date, days after today, and approved inactive days. |
| Energy | The postpaid per-KM rate (₹1.50 to start) in effect on the usage date, from **Validated** Daily KM records only. A bike shared by two riders that day needs review first. |
| Billing week | Monday to Sunday. |
| Payout | Saves each rider's earnings, deductions and net payout for an ended week. Weeks are paid in order once payouts have started. It can be re-triggered after corrections, and then only riders whose amounts changed are updated. |
| Close week | Saves the week's bills as billed. Later corrections are still allowed and show as changes since close. |

Rental and energy are **deductions** from the rider. A rider's net payout is
**Earnings − Deductions + Previous balance + Balance cleared − Escalation charges**
(see [Rider escalations](#rider-escalations)). A negative net is carried into the next week.

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
CORS setup is needed. In production the panel and the API must share one origin too; see
[`admin-ui/.env.example`](admin-ui/.env.example).

## Sign-in and roles

Every `/api` route except `/api/auth/*`, the payment webhook and the mock pay page needs a signed-in user; `/health` stays public.
Signing in sets an `httpOnly`, `SameSite=Strict` session cookie (`Secure` when `NODE_ENV=production`).
Sessions are stored in the `sessions` table and last `SESSION_TTL_HOURS` (default 12).

| Role | Can do |
|---|---|
| `admin` | Everything, including closing a billing week, triggering payouts, changing or removing partner IDs and moving earnings |
| `staff` | Everything else: riders, bikes, assignments, imports, Daily KM, adding partner IDs and reviewing pending earnings, viewing billing and payouts |

Admins manage users on the **Users** page: add, edit name/role, reset passwords, deactivate.
An admin cannot change their own role or deactivate themselves, and the last active admin
cannot be removed. Deactivating a user or resetting their password signs them out everywhere.
Everyone can change their own password from the top bar (other browsers are signed out).
`npm run user:create` is still needed once, to create the first admin.

## Rider app sign-in

The rider app signs in with a one-time code sent by SMS and then sends
`Authorization: Bearer <token>` on every `/api/rider-app/*` call. It never uses the admin cookie,
and admin sessions do not work on rider routes.

| Endpoint | What it does |
|---|---|
| `POST /api/rider-app/auth/otp/request` | `{ phone }`. Sends a 6-digit code, valid 5 minutes |
| `POST /api/rider-app/auth/otp/verify` | `{ phone, code, signup?, deviceInfo? }`. Returns `{ token, expiresAt, account }` |
| `GET /api/rider-app/auth/me` | The signed-in rider or applicant, and their application status |
| `POST /api/rider-app/auth/logout` | Ends this app session |

- **New riders:** `signup` is `{ firstName, surname, dateOfBirth }`, entered before the phone step.
  The Draft application (`YS-APP-…`) is created only once the code is correct. A new phone without
  `signup` gets `409 SIGNUP_REQUIRED` and the code stays valid for a second try with the details.
- **Existing phones:** riders sign in as riders; an open application resumes; a rejected applicant
  can sign in to see the reason and may start a new application 30 days after the decision.
  Terminated riders are refused (`403 ACCOUNT_CLOSED`).
- **Limits:** one code per 30 seconds and 5 an hour per phone, 20 an hour per IP (`429` with
  `Retry-After`); a code stops working after 5 wrong tries.
- **Sessions** belong to the phone, last `RIDER_SESSION_DAYS` (default 30) and are extended while
  in use. Only a SHA-256 hash of the token is stored. Terminating a rider or changing their phone
  signs that phone out of the app.
- **SMS is mocked:** codes are printed in the API log. In development `RIDER_OTP_IN_RESPONSE=true`
  also returns the code as `devOtp`; it is ignored when `NODE_ENV=production`. Sign-in needs
  `ID_HASH_KEY` set, since codes are stored as keyed hashes.

## Security

- **Sign-in limits:** after 5 failed attempts for one email, or 20 from one IP address, within
  15 minutes, sign-in answers `429` with a `Retry-After` header and the password is not checked.
  Failures are stored in `login_failures`, so limits survive restarts and work across instances.
  A successful sign-in clears that email's failures.
- **Behind a proxy:** set `TRUST_PROXY` to the number of proxies in front of the API (usually `1`),
  so the IP limit sees the real client address. Leave it unset otherwise; trusting a proxy that
  is not there lets clients fake their IP.
- **Headers:** [helmet](https://helmetjs.github.io/) sets security headers (CSP, HSTS, no sniffing,
  no framing) and removes `X-Powered-By`.
- **CSRF:** besides the `SameSite=Strict` cookie, changes (`POST`, `PATCH`, ...) that a browser
  marks as cross-site (`Sec-Fetch-Site`) are refused with `403`.
- **No CORS:** no CORS headers are sent, so other sites cannot read API responses.
- **Request bodies:** JSON bodies are limited to 100 kB (`413`); malformed JSON gets `400`;
  unknown `/api` routes get a JSON `404` (after the sign-in check).
- **Rider ID numbers:** Aadhaar, PAN, DL and bank account numbers are encrypted with AES-256-GCM
  (`ID_ENCRYPTION_KEY`) and stored with a keyed hash (`ID_HASH_KEY`) for duplicate checks and
  their last 4 digits for display. Set both keys before onboarding anyone and never change
  `ID_ENCRYPTION_KEY` afterwards, or stored numbers can no longer be read.
- **Document files:** uploads are checked by their first bytes (JPEG, PNG or PDF, at most 5 MB),
  saved under random names in `UPLOAD_DIR`, which must be outside the project folder.

## Partner earnings

Delivery partners send earnings sheets, uploaded in the **Document Hub** as *Partner Earnings*.
The partner decides the file format; supported formats live in
[`services/importTypes/partnerFormats/`](services/importTypes/partnerFormats/) (Blinkit and Zomato daily, Zepto weekly).

| Rule | How it works |
|---|---|
| Mapping | Each rider has at most one ID per partner, and an ID belongs to one rider at a time (**Partner Mappings**). IDs are stored trimmed and uppercase. Staff can add IDs; only admins change or remove them. |
| Matching by date | A row goes to the rider who held the ID **on the row's date**. A changed ID keeps its earlier earnings with the earlier rider; an ID's first mapping also covers dates before it. |
| Re-uploads | One row per partner + ID + date. The same amount changes nothing, a new amount updates the row, and a row missing from a later file stays. Negative amounts (partner penalties) are allowed. |
| Pending Review | Rows whose ID no rider held on that date wait in **Pending Earnings**. Resolve maps the ID and matches all its rows; Dismiss sets them aside with a reason, optionally ignoring the ID in future sheets. |
| Rejected rows | A row that failed to import (bad amount, unreadable or future date, duplicate) is kept with its ID and date. Re-uploading the corrected row clears it; otherwise dismiss it with a note. |
| Payout blocks | A week cannot be paid while it has pending earnings, rejected rows, or a partner sheet that does not cover it (daily sheets need all 7 days; a ₹0 row counts), or while the week before is unpaid and has something to pay. |
| History | Every change to an earning's amount, status or rider is kept in `partner_earning_changes`, with the file or user that made it. |

A payout calculates the week under a lock; imports and review actions for that week wait until it
finishes, so a payout never pays around a change made at the same moment.

## Rider escalations

From a rider's page (**Riders → Details**), an admin can **Escalate** with one or more reasons,
an optional amount and a comment:

| Kind | When | What happens |
|---|---|---|
| Charge | An amount, without Payment Due | The bike is locked and a payment link is sent. Unless paid or waived first, it is deducted from that week's payout and marked **Recovered**. |
| Payment Due | Payment Due is ticked, or automatically after last week's payout run for every rider it leaves negative | Collects the outstanding balance (last week's negative net). It is never deducted again; paying or waiving it clears the carried balance. Raised automatically, it locks the bike unless a team leader's payment promise is still due (lock status Skipped; **Lock now** locks it later). |
| Record | No amount | Kept for history only, with no lock or link. An admin closes it with a note. |

A follow-up whose outcome is Paid (shown as **Says paid**) only records what the rider said; the due
stays until a payment is recorded. A rider has at most one open Charge or Payment Due. Payments arrive through the signed webhook
(`POST /api/webhooks/payment`); if it did not arrive, an admin uses **Mark as paid** with a reference.
The bike is unlocked once nothing holds it locked. A Recovered charge that leaves the net negative
keeps the bike locked until the bike is returned to the hub.

The IoT lock and the payment provider are mocked in `services/integrations/`. A payment link opens
`/mock-pay/:token` in the admin panel, a public stand-in for the rider app with swipe to pay.
To try it, set in `.env`:

| Variable | Purpose |
|---|---|
| `ENABLE_MOCK_PAY=true` | Serves the mock pay API. Keep it off in production. |
| `PAYMENT_WEBHOOK_SECRET` | Secret the webhook is signed with; payments are refused without it. |
| `APP_URL` | Admin panel address used in payment links (default `http://localhost:5173`). |
| `MOCK_IOT_FAIL=true` | Makes every lock and unlock fail, to try **Retry lock**. |

`npm run demo:setup` builds `rider_demo` with an example: Meera Joshi (DM-008) owes ₹350 from
last week, and Amit Patil (DM-001) has an open ₹750 charge with his bike locked. It also adds demo
logins (admin, staff and three team leaders, password `demo-pass-123`, listed when it finishes) and
team leader scenarios dated from today; `demo/TEAM-LEADER-TESTING.md` walks through them.

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
| `npm run demo:setup` | Drop and recreate `rider_demo` with the demo data in `demo/seed.sql` |
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
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/password` (change your own) |
| Users (admin only) | `GET /api/users`, `POST /api/users`, `PATCH /api/users/:userId`, `POST /api/users/:userId/password` |
| Riders | `GET/POST /api/riders`, `GET/PUT/DELETE /api/riders/:riderId`, `GET /api/riders/summary` |
| Rider page | `GET /api/riders/:riderId/profile`, `GET /api/riders/:riderId/payouts`, `GET /api/riders/:riderId/assignments` |
| Escalations | `GET/POST /api/riders/:riderId/escalations` (POST admin; team leaders only a Record), `POST /api/escalations/:escalationId/mark-paid`, `…/waive`, `…/close`, `…/retry-lock` (admin) |
| Analytics | `GET /api/analytics/team-leaders?from=&to=` (admins and staff: calls, promises kept/broken, dues recovered, riders owing per team leader) |
| Follow-ups | `GET/POST /api/riders/:riderId/follow-ups` (append-only; a Promised to Pay follow-up needs a date within 30 days) |
| Team leaders | `GET /api/users/team-leaders` (admin), `GET/POST /api/riders/:riderId/team-leaders`, `DELETE /api/riders/:riderId/team-leaders/:userId` (POST/DELETE admin), `GET /api/tl/riders`, `GET /api/tl/queue` (team leader) |

A `team_leader` user can call only `GET /api/tl/riders` and `GET /api/tl/queue`, the rider page reads above (profile, payouts, assignments, escalations, follow-ups) and the two writes (log a follow-up, raise a Record) for riders assigned to them; everything else answers 403 (see `middleware/restrictTeamLeader.js`).
| Payments | `POST /api/webhooks/payment` (signed), `GET /api/mock-pay/:token`, `POST /api/mock-pay/:token/swipe` (with `ENABLE_MOCK_PAY=true`) |
| Inactive days | `GET/POST /api/riders/:riderId/inactive-periods`, `PATCH …/:periodId/approve`, `DELETE …/:periodId` |
| Hubs | `GET /api/hubs`, `POST /api/hubs` and `PATCH /api/hubs/:hubId` (admin; a hub with bikes cannot be deactivated) |
| Pricing | `GET /api/pricing`; admin: `POST /api/pricing/postpaid-rates`, `DELETE …/postpaid-rates/:rateId`, `POST /api/pricing/deposits`, `DELETE …/deposits/:depositId` (only prices not yet started), `POST /api/pricing/packs`, `PATCH …/packs/:packId`. Billing charges each day at the postpaid rate in effect that day; a new rate must start after the last closed or paid-out week |
| Bikes | `GET/POST /api/bikes` (POST needs an active `hubId`; GET filters by `hubId`), `GET /api/bikes/summary?hubId=`, `GET /api/bikes/:bikeId`, `PATCH /api/bikes/:bikeId/status`, `PATCH /api/bikes/:bikeId/hub` (not while assigned), `POST /api/bike-assignments` (needs an `Idempotency-Key` header), `POST /api/bikes/:bikeId/return`, `GET /api/bikes/:bikeId/assignments` |
| Imports | `GET /api/imports/types`, `GET /api/imports/summary`, `GET /api/imports`, `POST /api/imports` (CSV upload), `GET /api/imports/:importId` |
| Partners and mappings | `GET /api/partners`, `GET /api/partner-mappings`, `PUT /api/partner-mappings/riders/:riderId` |
| Partner earnings | `GET /api/partner-earnings/pending`, `POST …/pending/resolve`, `POST …/pending/dismiss`, `GET …/row-errors`, `POST …/row-errors/:errorId/dismiss`, `GET …/move-preview` and `POST …/move` (admin) |
| Daily KM | `GET /api/daily-km`, `GET /api/daily-km/candidates`, `POST /api/daily-km/validate`, `PATCH /api/daily-km/:recordId/resolve` |
| Billing | `GET /api/billing/bills`, `GET /api/billing/bills/export`, `GET /api/billing/riders/:riderId`, `POST /api/billing/weeks/:weekStart/close` (admin) |
| Payouts | `GET /api/payouts/weeks/:weekStart`, `POST /api/payouts/weeks/:weekStart/run` (admin), `GET /api/payouts/recent` |
| Dashboard | `GET /api/dashboard?weekStart=YYYY-MM-DD` |
