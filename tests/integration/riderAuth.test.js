const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

const PHONE = '9876543210';
const SIGNUP = { firstName: 'Ravi', surname: 'Kumar', dateOfBirth: '1995-06-15' };

async function requestCode(phone = PHONE) {
    const res = await h.riderApi('POST', '/api/rider-app/auth/otp/request', { phone });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.devOtp;
}

function verify(body) {
    return h.riderApi('POST', '/api/rider-app/auth/otp/verify', { phone: PHONE, ...body });
}

// Makes the phone's codes look older, to get past the 30-second resend wait.
async function ageCodes(phone, seconds) {
    await h.pool.query(
        `UPDATE rider_otps SET created_at = created_at - make_interval(secs => $2) WHERE phone = $1`,
        [phone, seconds]
    );
}

async function signUp(phone = PHONE) {
    const code = await requestCode(phone);
    const res = await h.riderApi('POST', '/api/rider-app/auth/otp/verify', { phone, code, signup: SIGNUP });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body;
}

async function riderPhone(riderId) {
    const { rows: [rider] } = await h.pool.query('SELECT phone FROM riders WHERE rider_id = $1', [riderId]);
    return rider.phone;
}

function me(token) {
    return h.riderApi('GET', '/api/rider-app/auth/me', undefined, token);
}

describe('Requesting a code', () => {
    it('sends a 6-digit code and stores only its hash', async () => {
        const res = await h.riderApi('POST', '/api/rider-app/auth/otp/request', { phone: PHONE });

        assert.equal(res.status, 200);
        assert.equal(res.body.expiresInSeconds, 300);
        assert.equal(res.body.resendAfterSeconds, 30);
        assert.match(res.body.devOtp, /^\d{6}$/);

        const { rows: [otp] } = await h.pool.query('SELECT code_hash FROM rider_otps WHERE phone = $1', [PHONE]);
        assert.match(otp.code_hash, /^[0-9a-f]{64}$/);
        assert.ok(!otp.code_hash.includes(res.body.devOtp));
    });

    it('rejects a phone that is not a 10-digit mobile number', async () => {
        for (const phone of ['12345', '5876543210', '+919876543210', undefined]) {
            const res = await h.riderApi('POST', '/api/rider-app/auth/otp/request', { phone });
            assert.equal(res.status, 400, String(phone));
        }
    });

    it('waits 30 seconds before a resend, and the new code replaces the old one', async () => {
        const oldCode = await requestCode();
        const tooSoon = await h.riderApi('POST', '/api/rider-app/auth/otp/request', { phone: PHONE });

        assert.equal(tooSoon.status, 429);
        assert.ok(Number(tooSoon.headers.get('retry-after')) <= 30);

        await ageCodes(PHONE, 31);
        let newCode = await requestCode();
        // The odd chance the two random codes match would make this test meaningless.
        while (newCode === oldCode) {
            await ageCodes(PHONE, 31);
            newCode = await requestCode();
        }

        assert.equal((await verify({ code: oldCode, signup: SIGNUP })).status, 400);
        assert.equal((await verify({ code: newCode, signup: SIGNUP })).status, 200);
    });

    it('allows 5 codes an hour per phone', async () => {
        for (let i = 0; i < 5; i++) {
            await requestCode();
            await ageCodes(PHONE, 31);
        }

        const res = await h.riderApi('POST', '/api/rider-app/auth/otp/request', { phone: PHONE });

        assert.equal(res.status, 429);
        assert.ok(Number(res.headers.get('retry-after')) > 30 * 60);
    });

    it('allows 20 codes an hour from one IP address', async () => {
        for (let i = 0; i < 20; i++) {
            await requestCode(String(9000000100 + i));
        }

        const res = await h.riderApi('POST', '/api/rider-app/auth/otp/request', { phone: '9000000999' });
        assert.equal(res.status, 429);
    });

    it('leaves the code out of the response unless asked for', async () => {
        process.env.RIDER_OTP_IN_RESPONSE = 'false';

        try {
            const res = await h.riderApi('POST', '/api/rider-app/auth/otp/request', { phone: PHONE });
            assert.equal(res.status, 200);
            assert.equal(res.body.devOtp, undefined);
        } finally {
            process.env.RIDER_OTP_IN_RESPONSE = 'true';
        }
    });
});

describe('Checking a code', () => {
    it('counts wrong codes down and stops the code after 5', async () => {
        const code = await requestCode();
        const wrong = code === '000000' ? '111111' : '000000';

        for (const left of [4, 3, 2, 1]) {
            const res = await verify({ code: wrong, signup: SIGNUP });
            assert.equal(res.status, 400);
            assert.equal(res.body.code, 'OTP_WRONG');
            assert.match(res.body.error, new RegExp(`${left} attempt`));
        }

        const fifth = await verify({ code: wrong, signup: SIGNUP });
        const correctAfter = await verify({ code, signup: SIGNUP });

        assert.equal(fifth.body.code, 'OTP_EXPIRED');
        assert.equal(correctAfter.status, 400);
        assert.equal(correctAfter.body.code, 'OTP_EXPIRED');
    });

    it('rejects an expired code, a used code and a code sent to another phone', async () => {
        const code = await requestCode();
        await h.pool.query(`UPDATE rider_otps SET expires_at = now() - interval '1 second'`);
        assert.equal((await verify({ code, signup: SIGNUP })).body.code, 'OTP_EXPIRED');

        await ageCodes(PHONE, 31);
        const fresh = await requestCode();
        assert.equal((await verify({ code: fresh, signup: SIGNUP })).status, 200);
        assert.equal((await verify({ code: fresh })).body.code, 'OTP_EXPIRED');

        const otherCode = await requestCode('9876500000');
        assert.equal((await verify({ code: otherCode })).status, 400);
    });

    it('rejects a code that is not 6 digits', async () => {
        await requestCode();

        for (const code of ['12345', '1234567', 'abcdef', undefined]) {
            assert.equal((await verify({ code })).status, 400, String(code));
        }
    });
});

describe('Signing up', () => {
    it('creates the Draft application, profile and event, and signs in', async () => {
        const code = await requestCode();
        const res = await verify({ code, signup: { ...SIGNUP, firstName: '  Ravi  ' }, deviceInfo: 'Pixel 7, Android 14' });

        assert.equal(res.status, 200);
        assert.match(res.body.token, /^[A-Za-z0-9_-]{43}$/);
        assert.deepEqual(res.body.account, {
            type: 'applicant',
            riderId: null,
            riderStatus: null,
            applicationNo: res.body.account.applicationNo,
            applicationStatus: 'Draft',
            currentStep: 'address',
            canReapplyFrom: null
        });
        assert.match(res.body.account.applicationNo, /^YS-APP-\d{7}$/);

        const { rows: [row] } = await h.pool.query(
            `SELECT p.first_name, p.surname, TO_CHAR(p.date_of_birth, 'YYYY-MM-DD') AS dob, e.event_type, e.actor_type
             FROM rider_applications a
             JOIN application_profiles p USING (application_id)
             JOIN application_events e USING (application_id)
             WHERE a.phone = $1`,
            [PHONE]
        );
        assert.deepEqual(row, { first_name: 'Ravi', surname: 'Kumar', dob: '1995-06-15', event_type: 'created', actor_type: 'rider' });

        const { rows: [session] } = await h.pool.query('SELECT token_hash, device_info FROM rider_sessions');
        assert.notEqual(session.token_hash, res.body.token);
        assert.equal(session.device_info, 'Pixel 7, Android 14');
    });

    it('rejects bad details and keeps the code usable', async () => {
        const code = await requestCode();

        const underage = await verify({ code, signup: { ...SIGNUP, dateOfBirth: h.addDays(h.todayInIst(), -365 * 17) } });
        const noName = await verify({ code, signup: { ...SIGNUP, surname: '  ' } });
        const digits = await verify({ code, signup: { ...SIGNUP, firstName: 'R4vi' } });

        assert.equal(underage.status, 400);
        assert.equal(underage.body.error, 'Riders must be at least 18 years old');
        assert.equal(noName.status, 400);
        assert.equal(digits.status, 400);
        assert.equal((await verify({ code, signup: SIGNUP })).status, 200);
    });

    it('asks a new phone that pressed Login to sign up, without using up the code', async () => {
        const code = await requestCode();
        const login = await verify({ code });

        assert.equal(login.status, 409);
        assert.equal(login.body.code, 'SIGNUP_REQUIRED');
        assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM rider_applications')).rows[0].n, 0);

        assert.equal((await verify({ code, signup: SIGNUP })).status, 200);
    });

    it('creates one application when the same code is sent twice at once', async () => {
        const code = await requestCode();
        const results = await Promise.all([verify({ code, signup: SIGNUP }), verify({ code, signup: SIGNUP })]);

        assert.deepEqual(results.map(res => res.status).sort(), [200, 400]);
        assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM rider_applications')).rows[0].n, 1);
    });
});

describe('Who signs in', () => {
    it('signs a rider in as a rider and ignores signup details', async () => {
        await h.createRider('R1');
        const phone = await riderPhone('R1');
        const code = await requestCode(phone);

        const res = await h.riderApi('POST', '/api/rider-app/auth/otp/verify', { phone, code, signup: SIGNUP });

        assert.equal(res.status, 200);
        assert.equal(res.body.account.type, 'rider');
        assert.equal(res.body.account.riderId, 'R1');
        assert.equal(res.body.account.riderStatus, 'Active');
        assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM rider_applications')).rows[0].n, 0);
    });

    it('turns a terminated rider away without a session', async () => {
        await h.createRider('R1', { status: 'Terminated', terminatedOn: '2026-11-01' });
        const phone = await riderPhone('R1');
        const code = await requestCode(phone);

        const res = await h.riderApi('POST', '/api/rider-app/auth/otp/verify', { phone, code });

        assert.equal(res.status, 403);
        assert.equal(res.body.code, 'ACCOUNT_CLOSED');
        assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM rider_sessions')).rows[0].n, 0);
    });

    it('resumes an open application instead of starting another', async () => {
        const first = await signUp();
        await ageCodes(PHONE, 31);

        const code = await requestCode();
        const res = await verify({ code, signup: { ...SIGNUP, firstName: 'Someone' } });

        assert.equal(res.status, 200);
        assert.equal(res.body.account.applicationNo, first.account.applicationNo);
        assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM rider_applications')).rows[0].n, 1);
    });

    it('shows a recent rejection and the date the rider can reapply', async () => {
        const first = await signUp();
        await h.pool.query(
            `UPDATE rider_applications
             SET status = 'Rejected', reject_reason = 'Documents do not match', submitted_at = now(), reviewed_at = now()`
        );
        await ageCodes(PHONE, 31);

        const code = await requestCode();
        const res = await verify({ code, signup: SIGNUP });

        assert.equal(res.status, 200);
        assert.equal(res.body.account.applicationNo, first.account.applicationNo);
        assert.equal(res.body.account.applicationStatus, 'Rejected');
        assert.equal(res.body.account.canReapplyFrom, h.addDays(h.todayInIst(), 30));
    });

    it('starts a flagged new application 30 days after a rejection', async () => {
        const first = await signUp();
        await h.pool.query(
            `UPDATE rider_applications
             SET status = 'Rejected', reject_reason = 'Documents do not match',
                 submitted_at = now() - interval '31 days', reviewed_at = now() - interval '31 days'`
        );
        await ageCodes(PHONE, 31);

        const code = await requestCode();
        const res = await verify({ code, signup: SIGNUP });

        assert.equal(res.status, 200);
        assert.notEqual(res.body.account.applicationNo, first.account.applicationNo);
        assert.equal(res.body.account.applicationStatus, 'Draft');

        const { rows: [latest] } = await h.pool.query(
            `SELECT a.is_reapplication, e.event_type
             FROM rider_applications a JOIN application_events e USING (application_id)
             WHERE a.application_no = $1`,
            [res.body.account.applicationNo]
        );
        assert.deepEqual(latest, { is_reapplication: true, event_type: 'reapplied' });
    });
});

describe('Rider app sessions', () => {
    it('needs a valid bearer token', async () => {
        const { token } = await signUp();

        assert.equal((await me(token)).status, 200);
        assert.equal((await me()).status, 401);
        assert.equal((await me('x'.repeat(43))).status, 401);
        assert.equal((await h.riderApi('GET', '/api/rider-app/auth/me', undefined, null, { Authorization: token })).status, 401);
    });

    it('stops working once expired or signed out', async () => {
        const first = await signUp();
        await h.pool.query(`UPDATE rider_sessions SET expires_at = now() - interval '1 second'`);
        assert.equal((await me(first.token)).status, 401);

        await ageCodes(PHONE, 31);
        const code = await requestCode();
        const { body: { token } } = await verify({ code });

        const logout = await h.riderApi('POST', '/api/rider-app/auth/logout', undefined, token);
        assert.equal(logout.status, 200);
        assert.equal((await me(token)).status, 401);
        // Signing out twice is fine.
        assert.equal((await h.riderApi('POST', '/api/rider-app/auth/logout', undefined, token)).status, 200);
    });

    it('keeps admin and rider sign-ins apart', async () => {
        const { token } = await signUp();

        // h.api sends the admin cookie.
        assert.equal((await h.api('GET', '/api/rider-app/auth/me')).status, 401);
        assert.equal((await h.api('GET', '/api/rider-app/anything')).status, 401);
        assert.equal((await h.riderApi('GET', '/api/riders', undefined, token)).status, 401);
        assert.equal((await h.riderApi('GET', '/api/rider-app/anything', undefined, token)).status, 404);
    });

    it('extends a session in use, at most once an hour', async () => {
        const { token } = await signUp();
        const expiresAt = async () => (await h.pool.query('SELECT expires_at FROM rider_sessions')).rows[0].expires_at;

        await h.pool.query(`UPDATE rider_sessions SET expires_at = now() + interval '1 day'`);
        await me(token);
        assert.ok(await expiresAt() < new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));

        await h.pool.query(`UPDATE rider_sessions SET last_used_at = now() - interval '2 hours'`);
        await me(token);
        assert.ok(await expiresAt() > new Date(Date.now() + 29 * 24 * 60 * 60 * 1000));
    });

    it('signs a rider out when terminated or when their phone changes', async () => {
        await h.createRider('R1');
        await h.createRider('R2');

        const signIn = async riderId => {
            const phone = await riderPhone(riderId);
            const code = await requestCode(phone);
            const res = await h.riderApi('POST', '/api/rider-app/auth/otp/verify', { phone, code });
            return res.body.token;
        };

        const terminatedToken = await signIn('R1');
        assert.equal((await h.api('DELETE', '/api/riders/R1')).status, 200);
        assert.equal((await me(terminatedToken)).status, 401);

        const movedToken = await signIn('R2');
        const update = await h.api('PUT', '/api/riders/R2', { name: 'Rider Two', phone: '9123456780', status: 'Active' });
        assert.equal(update.status, 200);
        assert.equal((await me(movedToken)).status, 401);

        const { rows } = await h.pool.query('SELECT count(*)::int AS n FROM rider_sessions WHERE revoked_at IS NULL');
        assert.equal(rows[0].n, 0);
    });

    it('sees an applicant approved mid-session as a rider', async () => {
        const { token } = await signUp();

        await h.pool.query(
            `INSERT INTO riders (rider_id, name, phone, status) VALUES ('YS-RID-20261124000001', 'Ravi Kumar', $1, 'Inactive')`,
            [PHONE]
        );
        await h.pool.query(
            `UPDATE rider_applications
             SET status = 'Payment Pending', rider_id = 'YS-RID-20261124000001', submitted_at = now()`
        );

        const res = await me(token);

        assert.equal(res.status, 200);
        assert.equal(res.body.account.type, 'rider');
        assert.equal(res.body.account.riderId, 'YS-RID-20261124000001');
        assert.equal(res.body.account.applicationStatus, 'Payment Pending');
    });

    it('accepts app requests without browser headers but refuses cross-site ones', async () => {
        const plain = await h.riderApi('POST', '/api/rider-app/auth/otp/request', { phone: PHONE });
        const crossSite = await h.riderApi('POST', '/api/rider-app/auth/otp/request', { phone: '9876500001' }, null, {
            'Sec-Fetch-Site': 'cross-site'
        });

        assert.equal(plain.status, 200);
        assert.equal(crossSite.status, 403);
    });
});
