// Shared setup for integration tests. Require this before anything else.
process.env.NODE_ENV = 'test';

const { pool } = require('../db');
const app = require('../app');

// Safety guard: never run integration tests against a real database.
const testDbName = new URL(process.env.TEST_DATABASE_URL ?? 'x://none/').pathname.slice(1);

if (!testDbName.endsWith('_test')) {
    throw new Error(
        `Refusing to run tests: TEST_DATABASE_URL must point to a *_test database (got "${testDbName}")`
    );
}

const TABLES = [
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

// Empty every table so each test starts from a known state.
async function resetDb() {
    await pool.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
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

// Send a JSON request and return { status, headers, body }.
async function api(method, path, body, headers = {}) {
    const isForm = body instanceof FormData;

    const response = await fetch(baseUrl + path, {
        method,
        headers: isForm ? headers : { 'Content-Type': 'application/json', ...headers },
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
    api,
    createRider,
    createBike,
    createAssignment,
    createKmRecord,
    todayInIst
};
