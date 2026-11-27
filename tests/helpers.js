// Shared setup for integration tests. Require this before anything else.
process.env.NODE_ENV = 'test';
// Fixed test keys, so tests never depend on the values in .env.
process.env.ID_HASH_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.ID_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
// Rider sign-in tests read the code from the response.
process.env.RIDER_OTP_IN_RESPONSE = 'true';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Each test file stores rider uploads in its own temporary folder, removed by stopServer.
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rider-test-uploads-'));
process.env.UPLOAD_DIR = uploadDir;

const { pool } = require('../db');
const app = require('../app');
const authService = require('../services/authService');
const { hashPassword } = require('../utils/password');
const { SESSION_COOKIE } = require('../utils/sessionCookie');

// Safety guard: never run integration tests against a real database.
const testDbName = new URL(process.env.TEST_DATABASE_URL ?? 'x://none/').pathname.slice(1);

if (!testDbName.endsWith('_test')) {
    throw new Error(
        `Refusing to run tests: TEST_DATABASE_URL must point to a *_test database (got "${testDbName}")`
    );
}

// partners and policy_versions are left out on purpose: their rows come from the schema, not from a test.
const TABLES = [
    'rider_sessions',
    'rider_otps',
    'rider_deposits',
    'rider_payments',
    'application_checks',
    'document_access_log',
    'application_events',
    'policy_acceptances',
    'application_bank_accounts',
    'application_document_files',
    'application_documents',
    'application_profiles',
    'rider_applications',
    'rider_follow_ups',
    'team_leader_riders',
    'escalation_events',
    'rider_escalations',
    'login_failures',
    'sessions',
    'users',
    'payout_items',
    'payout_runs',
    'partner_earning_changes',
    'partner_ignored_ids',
    'partner_earnings',
    'rider_partner_mappings',
    'import_row_errors',
    'import_batches',
    'billing_week_snapshots',
    'billing_week_closures',
    'daily_km_audit',
    'daily_km_records',
    'bike_assignments',
    'rider_inactive_periods',
    'idempotency_keys',
    'bikes',
    'hubs',
    'riders',
    'postpaid_rates',
    'deposit_amounts',
    'prepaid_packs'
];

// Every api() request is signed in as this admin unless it sends its own Cookie header.
let adminCookie;
// Every bike needs a hub; createBike uses this one unless told otherwise.
let defaultHubId;

// Empty every table so each test starts from a known state, with one signed-in admin, one hub
// and the starting postpaid rate (₹59/day, ₹1.50/km), as in schema.sql.
async function resetDb() {
    await pool.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    await pool.query(
        `INSERT INTO postpaid_rates (rental_per_day, energy_per_km, effective_from) VALUES (59, 1.50, '2000-01-01')`
    );

    const adminId = await createUser({ email: 'admin@test.local', role: 'admin' });
    adminCookie = await signIn(adminId);
    defaultHubId = await createHub('Test Hub');
}

function getDefaultHubId() {
    return defaultHubId;
}

let server;
let baseUrl;

async function startServer() {
    await new Promise(resolve => {
        server = app.listen(0, resolve);
    });

    baseUrl = `http://localhost:${server.address().port}`;
}

async function stopServer() {
    await new Promise(resolve => server.close(resolve));
    await pool.end();
    fs.rmSync(uploadDir, { recursive: true, force: true });
}

// Full URL of a path on the test server, for requests api() cannot make (e.g. a broken body).
function url(path) {
    return baseUrl + path;
}

// Send a JSON request and return { status, headers, body }.
async function api(method, path, body, headers = {}) {
    return send(method, path, body, { ...(adminCookie ? { Cookie: adminCookie } : {}), ...headers });
}

// A rider app request: a bearer token (if given) and never the admin cookie.
async function riderApi(method, path, body, token = null, headers = {}) {
    return send(method, path, body, { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers });
}

async function send(method, path, body, headers) {
    const isForm = body instanceof FormData;

    const response = await fetch(baseUrl + path, {
        method,
        headers: {
            ...(isForm ? {} : { 'Content-Type': 'application/json' }),
            ...headers
        },
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body)
    });

    const text = await response.text();
    let json;

    try {
        json = JSON.parse(text);
    } catch {
        json = text;
    }

    return { status: response.status, headers: response.headers, body: json };
}

// ---- Factories: insert rows directly so tests control dates. ----

// Every test user has this password. Hashing is slow, so it is hashed once.
const TEST_PASSWORD = 'test-password';
let testPasswordHash;

async function createUser({ email, role = 'staff', isActive = true }) {
    testPasswordHash ??= await hashPassword(TEST_PASSWORD);

    const result = await pool.query(
        `INSERT INTO users (email, name, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING user_id::int AS user_id`,
        [email, `User ${email}`, testPasswordHash, role, isActive]
    );

    return result.rows[0].user_id;
}

// A Cookie header value signed in as the user, for api(..., { Cookie }).
async function signIn(userId) {
    const { token } = await authService.createSession(userId);
    return `${SESSION_COOKIE}=${token}`;
}

let phoneCounter = 0;

async function createRider(riderId, { status = 'Active', terminatedOn = null, hubId = defaultHubId, isTest = false } = {}) {
    phoneCounter++;
    const phone = String(9000000000 + phoneCounter);

    await pool.query(
        `INSERT INTO riders (rider_id, name, phone, status, terminated_on, hub_id, is_test)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [riderId, `Rider ${riderId}`, phone, status, terminatedOn, hubId, isTest]
    );

    return riderId;
}

let hubCounter = 0;

async function createHub(name, { city = 'Pune', isActive = true } = {}) {
    hubCounter++;

    const result = await pool.query(
        `INSERT INTO hubs (code, name, city, address, is_active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING hub_id`,
        [`T-${hubCounter}`, name, city, `${name} address`, isActive]
    );

    return Number(result.rows[0].hub_id);
}

async function createBike(chassisNumber, { status = 'Available', registrationNumber = null, hubId = defaultHubId } = {}) {
    const result = await pool.query(
        `INSERT INTO bikes (chassis_number, registration_number, status, hub_id)
         VALUES ($1, $2, $3, $4)
         RETURNING bike_id`,
        [chassisNumber, registrationNumber, status, hubId]
    );

    return Number(result.rows[0].bike_id);
}

// Timestamps are IST strings, e.g. '2026-10-12 09:00'.
// An open assignment also marks the bike Assigned.
async function createAssignment(bikeId, riderId, assignedAt, returnedAt = null) {
    await pool.query(
        `INSERT INTO bike_assignments (bike_id, rider_id, assigned_at, returned_at)
         VALUES ($1, $2, $3::timestamp AT TIME ZONE 'Asia/Kolkata',
                 $4::timestamp AT TIME ZONE 'Asia/Kolkata')`,
        [bikeId, riderId, assignedAt, returnedAt]
    );

    if (!returnedAt) {
        await pool.query(`UPDATE bikes SET status = 'Assigned' WHERE bike_id = $1`, [bikeId]);
    }
}

async function createKmRecord({
    vin,
    bikeId = null,
    riderId = null,
    usageDate,
    dailyKm,
    status
}) {
    const result = await pool.query(
        `INSERT INTO daily_km_records
            (reported_vin, bike_id, rider_id, usage_date, daily_km, status, source_file_name)
         VALUES ($1, $2, $3, $4, $5, $6, 'test.csv')
         RETURNING km_record_id`,
        [vin, bikeId, riderId, usageDate, dailyKm, status]
    );

    return Number(result.rows[0].km_record_id);
}

// Today's date in IST as YYYY-MM-DD.
function todayInIst() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function addDays(date, days) {
    const result = new Date(`${date}T00:00:00.000Z`);
    result.setUTCDate(result.getUTCDate() + days);
    return result.toISOString().slice(0, 10);
}

// Monday of the current IST week.
function currentWeekStart() {
    const today = todayInIst();
    return addDays(today, -((new Date(`${today}T00:00:00.000Z`).getUTCDay() + 6) % 7));
}

// A payout for the rider in the given week with only a net, e.g. a negative net carried forward.
// Several riders in the same week share that week's run.
async function createPayoutItem(riderId, weekStart, netPayout) {
    const { rows: [run] } = await pool.query(
        `INSERT INTO payout_runs (week_start, run_number, rider_count, updated_count, total_amount)
         VALUES ($1, 1, 1, 1, 0)
         ON CONFLICT ON CONSTRAINT payout_runs_week_run_key
         DO UPDATE SET rider_count = payout_runs.rider_count + 1
         RETURNING run_id`,
        [weekStart]
    );

    await pool.query(
        `INSERT INTO payout_items
            (week_start, rider_id, rental_days, total_rental, total_km, total_energy_charge, total_amount,
             total_earnings, net_payout, first_run_id, updated_run_id)
         VALUES ($1, $2, 0, 0, 0, 0, 0, 0, $3, $4, $4)`,
        [weekStart, riderId, netPayout, run.run_id]
    );
}

module.exports = {
    pool,
    resetDb,
    startServer,
    stopServer,
    uploadDir,
    url,
    api,
    riderApi,
    TEST_PASSWORD,
    createUser,
    signIn,
    createRider,
    createHub,
    getDefaultHubId,
    createBike,
    createAssignment,
    createKmRecord,
    todayInIst,
    addDays,
    currentWeekStart,
    createPayoutItem
};
