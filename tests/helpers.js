// Shared setup for integration tests. Require this before anything else.
process.env.NODE_ENV = 'test';

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

// partners is left out on purpose: its rows come from the schema, not from a test.
const TABLES = [
    'login_failures',
    'sessions',
    'users',
    'payout_items',
    'payout_runs',
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
    'riders'
];

// Every api() request is signed in as this admin unless it sends its own Cookie header.
let adminCookie;

// Empty every table so each test starts from a known state, with one signed-in admin.
async function resetDb() {
    await pool.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);

    const adminId = await createUser({ email: 'admin@test.local', role: 'admin' });
    adminCookie = await signIn(adminId);
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
}

// Full URL of a path on the test server, for requests api() cannot make (e.g. a broken body).
function url(path) {
    return baseUrl + path;
}

// Send a JSON request and return { status, headers, body }.
async function api(method, path, body, headers = {}) {
    const isForm = body instanceof FormData;

    const response = await fetch(baseUrl + path, {
        method,
        headers: {
            ...(isForm ? {} : { 'Content-Type': 'application/json' }),
            ...(adminCookie ? { Cookie: adminCookie } : {}),
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

async function createRider(riderId, { status = 'Active', terminatedOn = null } = {}) {
    phoneCounter++;
    const phone = String(9000000000 + phoneCounter);

    await pool.query(
        `INSERT INTO riders (rider_id, name, phone, status, terminated_on)
         VALUES ($1, $2, $3, $4, $5)`,
        [riderId, `Rider ${riderId}`, phone, status, terminatedOn]
    );

    return riderId;
}

async function createBike(chassisNumber, { status = 'Available', registrationNumber = null } = {}) {
    const result = await pool.query(
        `INSERT INTO bikes (chassis_number, registration_number, status)
         VALUES ($1, $2, $3)
         RETURNING bike_id`,
        [chassisNumber, registrationNumber, status]
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

module.exports = {
    pool,
    resetDb,
    startServer,
    stopServer,
    url,
    api,
    TEST_PASSWORD,
    createUser,
    signIn,
    createRider,
    createBike,
    createAssignment,
    createKmRecord,
    todayInIst
};
