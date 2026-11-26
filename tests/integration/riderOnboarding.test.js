const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const {
    aadhaarFrom,
    JPEG,
    AADHAAR,
    PAN,
    DL,
    ACCOUNT,
    signUp,
    putForm,
    put,
    getOnboarding,
    submit,
    STEP_SAVES,
    completeSteps
} = require('../onboardingFlow');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

const PDF = Buffer.from('%PDF-1.7\n');
const EXE = Buffer.from('MZ\x90\x00 renamed program');

async function latestChecks(applicationNo) {
    const { rows } = await h.pool.query(
        `SELECT DISTINCT ON (c.kind) c.kind, c.status, c.details
         FROM application_checks c
         JOIN rider_applications a USING (application_id)
         WHERE a.application_no = $1
         ORDER BY c.kind, c.created_at DESC, c.check_id DESC`,
        [applicationNo]
    );

    return Object.fromEntries(rows.map(row => [row.kind, row]));
}

function storedFileCount() {
    return fs.readdirSync(h.uploadDir, { recursive: true }).filter(name => /\.(jpg|png|pdf)$/.test(name)).length;
}

describe('Onboarding steps', () => {
    it('takes a new rider through every step to Pending Review', async () => {
        const token = await signUp();
        await completeSteps(token);

        const before = await getOnboarding(token);
        assert.equal(before.body.currentStep, 'summary');
        assert.ok(before.body.steps.every(step => step.state === 'done'));

        const res = await submit(token);

        assert.equal(res.status, 200);
        assert.equal(res.body.status, 'Pending Review');
        assert.equal(res.body.details.documents.aadhaar.numberLast4, AADHAAR.slice(-4));
        assert.deepEqual(res.body.details.documents.aadhaar.sides, ['back', 'front']);
        assert.equal(res.body.details.bank.accountLast4, '9012');
        assert.deepEqual(res.body.details.plan, { planType: 'Postpaid', pack: null });

        // Full ID and account numbers never leave the server.
        const text = JSON.stringify(res.body);
        for (const number of [AADHAAR, PAN, DL, ACCOUNT]) {
            assert.ok(!text.includes(number), number);
        }

        const checks = await latestChecks(res.body.applicationNo);
        assert.deepEqual(
            Object.values(checks).map(check => [check.kind, check.status]),
            [['bank', 'Clear'], ['dl', 'Clear'], ['duplicate', 'Clear'], ['pan', 'Clear']]
        );

        const { rows: [bank] } = await h.pool.query('SELECT verification_status, verified_name FROM application_bank_accounts');
        assert.deepEqual(bank, { verification_status: 'Verified', verified_name: 'RAVI KUMAR' });

        const { rows: events } = await h.pool.query('SELECT event_type FROM application_events ORDER BY event_id');
        assert.deepEqual(events.map(event => event.event_type), ['created', 'submitted']);
    });

    it('lists the plans and policy the app shows', async () => {
        const token = await signUp();
        await h.pool.query(
            `INSERT INTO prepaid_packs (kind, name, price, km_included, validity_days, is_active) VALUES
                ('Weekly', '400 KM Weekly', 1000, 400, 7, true),
                ('Weekly', 'Old Weekly', 900, 350, 7, false),
                ('TopUp', '50 KM Top-up', 150, 50, 3, true)`
        );
        await h.pool.query(`INSERT INTO deposit_amounts (amount, effective_from) VALUES (2000, '2026-01-01')`);

        const plans = await h.riderApi('GET', '/api/rider-app/plans', undefined, token);
        const policy = await h.riderApi('GET', '/api/rider-app/policies/current', undefined, token);

        assert.equal(plans.status, 200);
        assert.deepEqual(plans.body.postpaid, { rentalPerDay: 59, energyPerKm: 1.5 });
        assert.deepEqual(plans.body.prepaidPacks.map(pack => pack.name), ['400 KM Weekly']);
        assert.equal(plans.body.depositAmount, 2000);
        assert.equal(policy.body.policy.version, 1);
    });

    it('keeps steps in order but lets the rider go back', async () => {
        const token = await signUp();

        assert.equal((await STEP_SAVES.pan(token)).status, 409);

        await completeSteps(token, { stopBefore: 'pan' });
        const back = await STEP_SAVES.address(token);

        assert.equal(back.status, 200);
        assert.equal(back.body.currentStep, 'pan');
        assert.deepEqual(
            back.body.steps.slice(0, 5).map(step => [step.key, step.state]),
            [['personal', 'done'], ['address', 'done'], ['aadhaar', 'done'], ['pan', 'current'], ['dl', 'todo']]
        );

        const personal = await put(token, 'personal', { firstName: 'Ravindra', surname: 'Kumar', dateOfBirth: '1995-06-15' });
        assert.equal(personal.status, 200);
        assert.equal(personal.body.details.personal.firstName, 'Ravindra');
    });

    it('rejects invalid details', async () => {
        const token = await signUp();
        await completeSteps(token, { stopBefore: 'aadhaar' });

        const badAadhaar = await STEP_SAVES.aadhaar(token, `${AADHAAR.slice(0, -1)}${(Number(AADHAAR.at(-1)) + 1) % 10}`);
        const noBack = await putForm(token, 'aadhaar', { number: AADHAAR }, { front: JPEG });
        const notAPhoto = await putForm(token, 'aadhaar', { number: AADHAAR }, { front: EXE, back: JPEG });
        const tooBig = await putForm(token, 'aadhaar', { number: AADHAAR }, { front: Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]), back: JPEG });

        assert.equal(badAadhaar.body.error, 'Enter a valid 12-digit Aadhaar number');
        assert.equal(noBack.body.error, 'The back photo is required');
        assert.equal(notAPhoto.body.error, 'Only JPEG, PNG or PDF files are allowed');
        assert.equal(tooBig.status, 400);

        await completeSteps(token, { stopBefore: 'dl' });
        const soonExpiring = await putForm(
            token, 'dl', { number: DL, expiryDate: h.addDays(h.todayInIst(), 10) }, { front: JPEG, back: JPEG }
        );
        assert.equal(soonExpiring.body.error, 'The driving licence must be valid for at least 30 more days');

        await completeSteps(token, { stopBefore: 'selfie' });
        assert.equal((await putForm(token, 'selfie', {}, { photo: PDF })).body.error, 'Only JPEG or PNG photos are allowed');

        await completeSteps(token, { stopBefore: 'emergency-contact' });
        const { rows: [{ phone }] } = await h.pool.query('SELECT phone FROM rider_applications');
        const ownPhone = await put(token, 'emergency-contact', { name: 'Sita Kumar', relation: 'Mother', phone });
        assert.equal(ownPhone.status, 400);

        await completeSteps(token, { stopBefore: 'bank' });
        assert.equal((await put(token, 'bank', { accountNumber: ACCOUNT, ifsc: 'SBIN1234', holderName: 'Ravi Kumar' })).status, 400);

        await completeSteps(token, { stopBefore: 'plan' });
        const { rows: [{ pack_id: oldPackId }] } = await h.pool.query(
            `INSERT INTO prepaid_packs (kind, name, price, km_included, validity_days, is_active)
             VALUES ('Weekly', 'Old Weekly', 900, 350, 7, false) RETURNING pack_id`
        );
        assert.equal((await put(token, 'plan', { planType: 'Prepaid' })).status, 400);
        assert.equal((await put(token, 'plan', { planType: 'Prepaid', packId: oldPackId })).status, 400);
        assert.equal((await put(token, 'plan', { planType: 'Postpaid', packId: oldPackId })).status, 400);

        // Nothing was saved by the failed steps.
        assert.equal((await getOnboarding(token)).body.currentStep, 'plan');
    });

    it('keeps the old version when a document is uploaded again', async () => {
        const token = await signUp();
        await completeSteps(token, { stopBefore: 'pan' });
        await STEP_SAVES.aadhaar(token);

        const { rows } = await h.pool.query(
            `SELECT d.version, d.is_current, count(f.file_id)::int AS files
             FROM application_documents d
             JOIN application_document_files f USING (document_id)
             WHERE d.doc_type = 'aadhaar'
             GROUP BY d.document_id
             ORDER BY d.version`
        );

        assert.deepEqual(rows, [
            { version: 1, is_current: false, files: 2 },
            { version: 2, is_current: true, files: 2 }
        ]);
    });

    it('saves a prepaid plan with its weekly pack', async () => {
        const token = await signUp();
        const { rows: [{ pack_id: packId }] } = await h.pool.query(
            `INSERT INTO prepaid_packs (kind, name, price, km_included, validity_days)
             VALUES ('Weekly', '400 KM Weekly', 1000, 400, 7) RETURNING pack_id::int`
        );

        await completeSteps(token, { overrides: { plan: t => put(t, 'plan', { planType: 'Prepaid', packId }) } });
        const res = await getOnboarding(token);

        assert.deepEqual(res.body.details.plan, {
            planType: 'Prepaid',
            pack: { packId, name: '400 KM Weekly', price: 1000, kmIncluded: 400 }
        });
    });
});

describe('Submitting', () => {
    it('needs every step done first', async () => {
        const token = await signUp();
        await completeSteps(token, { stopBefore: 'plan' });

        const res = await submit(token);

        assert.equal(res.status, 409);
        assert.equal(res.body.error, 'Complete every step before submitting');
    });

    it('locks the application once submitted, and deletes files sent after that', async () => {
        const token = await signUp();
        await completeSteps(token);
        await submit(token);
        const filesBefore = storedFileCount();

        const lateUpload = await STEP_SAVES.aadhaar(token);

        assert.equal(lateUpload.status, 409);
        assert.equal(storedFileCount(), filesBefore);
        assert.equal((await STEP_SAVES.bank(token)).status, 409);
        assert.equal((await submit(token)).status, 409);
    });

    it('lets the rider fix only the steps sent back, then resubmit', async () => {
        const token = await signUp();
        await completeSteps(token);
        await submit(token);

        await h.pool.query(`UPDATE rider_applications SET status = 'Changes Requested', fix_steps = '{pan}'`);
        await h.pool.query(
            `UPDATE application_documents SET review_status = 'Rejected', review_reason = 'Photo is blurred'
             WHERE doc_type = 'pan'`
        );

        const waiting = await getOnboarding(token);
        assert.deepEqual(waiting.body.steps.find(step => step.key === 'pan'), { key: 'pan', state: 'fix', reason: 'Photo is blurred' });

        assert.equal((await STEP_SAVES.bank(token)).status, 409);
        assert.equal((await submit(token)).body.error, 'Fix every item sent back before submitting');

        assert.equal((await STEP_SAVES.pan(token)).status, 200);
        const res = await submit(token);

        assert.equal(res.status, 200);
        assert.equal(res.body.status, 'Resubmitted');
        assert.equal(res.body.details.documents.pan.reviewStatus, 'Pending');
    });

    it('flags the same PAN on another application without blocking the submit', async () => {
        const first = await signUp();
        await completeSteps(first);
        const firstApplication = (await submit(first)).body.applicationNo;

        const second = await signUp({ firstName: 'Amit', surname: 'Shah', dateOfBirth: '1990-01-01' });
        await completeSteps(second, {
            overrides: {
                aadhaar: t => STEP_SAVES.aadhaar(t, aadhaarFrom('34512341234')),
                bank: t => put(t, 'bank', { accountNumber: '999988887777', ifsc: 'SBIN0001234', holderName: 'Amit Shah' })
            }
        });
        const res = await submit(second);

        assert.equal(res.status, 200);
        assert.equal(res.body.status, 'Pending Review');

        const checks = await latestChecks(res.body.applicationNo);
        assert.equal(checks.duplicate.status, 'Flagged');
        assert.deepEqual(checks.duplicate.details.matches, [
            { field: 'dl', applicationNo: firstApplication, applicationStatus: 'Pending Review', riderId: null, riderStatus: null },
            { field: 'pan', applicationNo: firstApplication, applicationStatus: 'Pending Review', riderId: null, riderStatus: null }
        ]);
    });

    it('flags a bank account in another name', async () => {
        const token = await signUp();
        await completeSteps(token, { overrides: { bank: t => STEP_SAVES.bank(t, 'Suresh Patil') } });

        const res = await submit(token);
        const checks = await latestChecks(res.body.applicationNo);

        assert.equal(checks.bank.status, 'Flagged');
        assert.deepEqual(checks.bank.details, { nameAtBank: 'SURESH PATIL', nameMatches: false });

        const { rows: [bank] } = await h.pool.query('SELECT verification_status FROM application_bank_accounts');
        assert.equal(bank.verification_status, 'Mismatch');
    });

    it('still submits when the KYC provider is down', async () => {
        const token = await signUp();
        await completeSteps(token);
        process.env.MOCK_KYC_FAIL = 'true';

        try {
            const res = await submit(token);
            const checks = await latestChecks(res.body.applicationNo);

            assert.equal(res.body.status, 'Pending Review');
            assert.deepEqual([checks.bank.status, checks.pan.status, checks.dl.status], ['Failed', 'Failed', 'Failed']);
        } finally {
            delete process.env.MOCK_KYC_FAIL;
        }
    });
});

describe('Who can use the onboarding steps', () => {
    it('stops an approved applicant from changing steps', async () => {
        const token = await signUp();
        await completeSteps(token);
        await submit(token);

        const { rows: [{ phone }] } = await h.pool.query('SELECT phone FROM rider_applications');
        await h.pool.query(
            `INSERT INTO riders (rider_id, name, phone, status, hub_id) VALUES ('YS-RID-1', 'Ravi Kumar', $1, 'Inactive', $2)`,
            [phone, h.getDefaultHubId()]
        );
        await h.pool.query(`UPDATE rider_applications SET status = 'Payment Pending', rider_id = 'YS-RID-1'`);

        assert.equal((await STEP_SAVES.bank(token)).status, 409);
        assert.equal((await getOnboarding(token)).body.status, 'Payment Pending');
    });

    it('answers 404 for a rider who joined before the app', async () => {
        await h.createRider('R1');
        const { rows: [{ phone }] } = await h.pool.query(`SELECT phone FROM riders WHERE rider_id = 'R1'`);
        const { body: { devOtp } } = await h.riderApi('POST', '/api/rider-app/auth/otp/request', { phone });
        const { body: { token } } = await h.riderApi('POST', '/api/rider-app/auth/otp/verify', { phone, code: devOtp });

        assert.equal((await getOnboarding(token)).status, 404);
    });

    it('needs a rider app sign-in', async () => {
        assert.equal((await h.riderApi('GET', '/api/rider-app/onboarding')).status, 401);
        assert.equal((await h.api('GET', '/api/rider-app/plans')).status, 401);
    });
});
