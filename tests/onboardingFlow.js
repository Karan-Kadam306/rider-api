// Drives the rider app's onboarding API the way the app does, for tests that need real applications.
const assert = require('node:assert/strict');
const h = require('./helpers');
const { verhoeffValid } = require('../utils/onboardingValidators');

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

// Appends the digit that makes the number pass Aadhaar's checksum.
function aadhaarFrom(digits) {
    for (let d = 0; d <= 9; d++) {
        if (verhoeffValid(digits + d)) {
            return digits + d;
        }
    }
}

const AADHAAR = aadhaarFrom('23412341234');
const PAN = 'ABCPE1234F';
const DL = 'MH1220190012345';
const ACCOUNT = '123456789012';

let phoneCounter = 0;

// Signs up a new applicant and returns their token.
async function signUp(signup = { firstName: 'Ravi', surname: 'Kumar', dateOfBirth: '1995-06-15' }) {
    phoneCounter++;
    const phone = String(9800000000 + phoneCounter);
    const { body: { devOtp } } = await h.riderApi('POST', '/api/rider-app/auth/otp/request', { phone });
    const res = await h.riderApi('POST', '/api/rider-app/auth/otp/verify', { phone, code: devOtp, signup });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.token;
}

// A multipart step: text fields plus files, e.g. { front: JPEG }.
function putForm(token, step, fields, files = {}) {
    const form = new FormData();

    for (const [name, value] of Object.entries(fields)) {
        form.append(name, value);
    }

    for (const [name, content] of Object.entries(files)) {
        form.append(name, new Blob([content]), `${name}.jpg`);
    }

    return h.riderApi('PUT', `/api/rider-app/onboarding/${step}`, form, token);
}

function put(token, step, body) {
    return h.riderApi('PUT', `/api/rider-app/onboarding/${step}`, body, token);
}

function getOnboarding(token) {
    return h.riderApi('GET', '/api/rider-app/onboarding', undefined, token);
}

function submit(token) {
    return h.riderApi('POST', '/api/rider-app/onboarding/submit', undefined, token);
}

// Each step with valid data, in order.
const STEP_SAVES = {
    address: token => putForm(
        token,
        'address',
        { addressLine1: 'Flat 4, Shanti Niwas', city: 'Pune', state: 'Maharashtra', pincode: '411057', addressProofKind: 'Electricity Bill' },
        { front: JPEG }
    ),
    aadhaar: (token, number = AADHAAR) => putForm(token, 'aadhaar', { number }, { front: JPEG, back: JPEG }),
    pan: (token, number = PAN) => putForm(token, 'pan', { number }, { front: JPEG }),
    dl: token => putForm(token, 'dl', { number: DL, expiryDate: h.addDays(h.todayInIst(), 365) }, { front: JPEG, back: JPEG }),
    selfie: token => putForm(token, 'selfie', {}, { photo: JPEG }),
    'emergency-contact': token => put(token, 'emergency-contact', { name: 'Sita Kumar', relation: 'Mother', phone: '9123456789' }),
    policies: async token => {
        const { body: { policy } } = await h.riderApi('GET', '/api/rider-app/policies/current', undefined, token);
        return put(token, 'policies', { policyVersionId: policy.policyVersionId });
    },
    bank: (token, holderName = 'Ravi Kumar') => put(token, 'bank', { accountNumber: ACCOUNT, ifsc: 'SBIN0001234', holderName }),
    plan: token => put(token, 'plan', { planType: 'Postpaid' })
};

// Saves every step up to (not including) stopBefore.
async function completeSteps(token, { stopBefore = null, overrides = {} } = {}) {
    for (const [step, save] of Object.entries(STEP_SAVES)) {
        if (step === stopBefore) {
            return;
        }

        const res = await (overrides[step] ?? save)(token);
        assert.equal(res.status, 200, `${step}: ${JSON.stringify(res.body)}`);
    }
}

// A new applicant who finished every step and submitted. Returns their token and application ID.
async function submittedApplication(signup) {
    const token = await signUp(signup);
    await completeSteps(token);

    const res = await submit(token);
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const { rows: [{ application_id: applicationId }] } = await h.pool.query(
        'SELECT application_id::int AS application_id FROM rider_applications WHERE application_no = $1',
        [res.body.applicationNo]
    );

    return { token, applicationId };
}

module.exports = {
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
    completeSteps,
    submittedApplication
};
