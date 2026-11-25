const crypto = require('crypto');
const { pool, inTransaction } = require('../db');
const AppError = require('../errors/AppError');
const riderOtpRepository = require('../repositories/riderOtpRepository');
const riderSessionRepository = require('../repositories/riderSessionRepository');
const applicationRepository = require('../repositories/applicationRepository');
const riderRepository = require('../repositories/riderRepository');
const smsClient = require('./integrations/smsClient');
const { todayInIst } = require('./billingService');
const { hashIdentifier } = require('../utils/hashIdentifier');
const { validatePhone, validateAge } = require('../utils/onboardingValidators');

// Rider app sign-in: a 6-digit code by SMS, then a bearer token the app keeps.
const OTP_TTL_MINUTES = 5;
const MAX_WRONG_CODES = 5;
const RESEND_AFTER_SECONDS = 30;
// Codes that may be sent in an hour.
const MAX_SENDS_PER_PHONE = 5;
const MAX_SENDS_PER_IP = 20;

const SESSION_DAYS = Number(process.env.RIDER_SESSION_DAYS) || 30;
const NAME_MAX_LENGTH = 60;

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function hashCode(phone, code) {
    return hashIdentifier('otp', `${phone}:${code}`);
}

function sameHash(a, b) {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

// Only for trying the app in development; never in production.
function showDevOtp() {
    return process.env.RIDER_OTP_IN_RESPONSE === 'true' && process.env.NODE_ENV !== 'production';
}

function cleanPhone(phone) {
    const error = validatePhone(phone);

    if (error) {
        throw new AppError(error, 400);
    }

    return String(phone).trim();
}

// One request at a time per phone, so limits and code checks cannot race.
async function lockPhone(client, phone) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`rider-phone:${phone}`]);
}

function waitText(seconds) {
    if (seconds < 60) {
        return `${seconds} second${seconds === 1 ? '' : 's'}`;
    }

    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function secondsUntil(time, afterSeconds) {
    return Math.max(1, Math.ceil((new Date(time).getTime() + afterSeconds * 1000 - Date.now()) / 1000));
}

// Refuses a new code within 30 seconds of the last one, or past the hourly limits.
async function assertCanSend(client, { phone, ipAddress }) {
    const recent = await riderOtpRepository.countRecentSends(client, { phone, ipAddress });
    const waits = [];
    const secondsSinceLast = recent.phone_latest
        ? (Date.now() - new Date(recent.phone_latest).getTime()) / 1000
        : Infinity;

    if (secondsSinceLast < RESEND_AFTER_SECONDS) {
        waits.push(secondsUntil(recent.phone_latest, RESEND_AFTER_SECONDS));
    }

    if (recent.phone_sends >= MAX_SENDS_PER_PHONE) {
        waits.push(secondsUntil(recent.phone_oldest, 60 * 60));
    }

    if (recent.ip_sends >= MAX_SENDS_PER_IP) {
        waits.push(secondsUntil(recent.ip_oldest, 60 * 60));
    }

    if (waits.length) {
        const retryAfterSeconds = Math.max(...waits);
        const error = new AppError(`Please wait ${waitText(retryAfterSeconds)} before asking for another code`, 429);
        error.retryAfterSeconds = retryAfterSeconds;
        throw error;
    }
}

// The same answer whether or not the phone is known, so this does not reveal who is registered.
async function requestOtp({ phone, ipAddress = 'unknown' }) {
    const cleanedPhone = cleanPhone(phone);
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');

    await inTransaction(async client => {
        await lockPhone(client, cleanedPhone);
        await assertCanSend(client, { phone: cleanedPhone, ipAddress });
        await riderOtpRepository.insertOtp(client, {
            phone: cleanedPhone,
            codeHash: hashCode(cleanedPhone, code),
            expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
            ipAddress
        });
    });

    await smsClient.sendOtp(cleanedPhone, code);

    return {
        expiresInSeconds: OTP_TTL_MINUTES * 60,
        resendAfterSeconds: RESEND_AFTER_SECONDS,
        ...(showDevOtp() && { devOtp: code })
    };
}

function cleanName(value, field) {
    const clean = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

    if (!clean || clean.length > NAME_MAX_LENGTH || /\p{N}/u.test(clean) || !/\p{L}/u.test(clean)) {
        throw new AppError(`${field} is required: letters only, at most ${NAME_MAX_LENGTH} characters`, 400);
    }

    return clean;
}

// The personal details a new rider enters before the phone step, and may correct later.
function cleanPersonalDetails(details) {
    const clean = {
        firstName: cleanName(details?.firstName, 'firstName'),
        surname: cleanName(details?.surname, 'surname'),
        dateOfBirth: details?.dateOfBirth
    };

    const ageError = validateAge(clean.dateOfBirth, todayInIst());

    if (ageError) {
        throw new AppError(ageError, 400);
    }

    return clean;
}

// What the phone is to us: a rider, an applicant, or both while an approved application finishes.
async function findAccount(client, phone) {
    // One after the other: inside a transaction both queries share one connection.
    const rider = await riderRepository.findByPhone(client, phone);
    const application = await applicationRepository.findLatestByPhone(client, { phone });

    return rider || application ? { rider, application } : null;
}

// The app decides which screen to show from this.
function toAccount({ rider, application }) {
    return {
        type: rider ? 'rider' : 'applicant',
        riderId: rider?.rider_id ?? null,
        riderStatus: rider?.status ?? null,
        applicationNo: application?.application_no ?? null,
        applicationStatus: application?.status ?? null,
        currentStep: application?.current_step ?? null,
        canReapplyFrom: application?.can_reapply_from ?? null
    };
}

async function createApplication(client, { phone, details, isReapplication }) {
    const application = await applicationRepository.insertApplication(client, {
        applicationNo: await applicationRepository.nextApplicationNo(client),
        phone,
        isReapplication
    });

    await applicationRepository.insertProfile(client, { applicationId: application.application_id, ...details });
    await applicationRepository.insertEvent(client, {
        applicationId: application.application_id,
        eventType: isReapplication ? 'reapplied' : 'created',
        toStatus: application.status,
        actorType: 'rider'
    });

    return application;
}

async function createSession(client, { phone, deviceInfo, ipAddress }) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

    await riderSessionRepository.insertSession(client, {
        tokenHash: hashToken(token),
        phone,
        expiresAt,
        deviceInfo,
        ipAddress
    });

    return { token, expiresAt };
}

// Checks the code, then signs the phone in. A new phone needs signup details, and gets its Draft
// application here, so nothing is stored for a phone that was never verified.
// Errors that must keep a change (a wrong attempt, a used code) are returned from the transaction
// and thrown after it commits.
async function verifyOtp({ phone, code, signup, deviceInfo, ipAddress = 'unknown' }) {
    const cleanedPhone = cleanPhone(phone);

    if (!/^\d{6}$/.test(String(code ?? ''))) {
        throw new AppError('Enter the 6-digit code', 400);
    }

    const cleanDevice = typeof deviceInfo === 'string' ? deviceInfo.trim().slice(0, 200) || null : null;

    const outcome = await inTransaction(async client => {
        await lockPhone(client, cleanedPhone);
        const otp = await riderOtpRepository.findLatestForUpdate(client, { phone: cleanedPhone });

        if (!otp || otp.is_expired || otp.attempts >= MAX_WRONG_CODES) {
            return { error: new AppError('This code has expired. Please request a new one', 400, 'OTP_EXPIRED') };
        }

        if (!sameHash(otp.code_hash, hashCode(cleanedPhone, code))) {
            const attemptsLeft = MAX_WRONG_CODES - await riderOtpRepository.addAttempt(client, { otpId: otp.otp_id });

            return {
                error: attemptsLeft > 0
                    ? new AppError(`Wrong code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left`, 400, 'OTP_WRONG')
                    : new AppError('Wrong code. Please request a new one', 400, 'OTP_EXPIRED')
            };
        }

        let account = await findAccount(client, cleanedPhone);

        if (account?.rider?.status === 'Terminated') {
            await riderOtpRepository.markConsumed(client, { otpId: otp.otp_id });
            return { error: new AppError('Your account is closed. Please contact your hub', 403, 'ACCOUNT_CLOSED') };
        }

        // The code stays valid, so the app can collect the details and verify again without a new SMS.
        if (!account && !signup) {
            return { error: new AppError('No account for this number. Please sign up', 409, 'SIGNUP_REQUIRED') };
        }

        // A new phone, or a rejected applicant whose wait is over, starts a new application.
        // Bad details throw, which rolls back and leaves the code usable.
        if (signup && (!account || (!account.rider && account.application.can_reapply))) {
            const application = await createApplication(client, {
                phone: cleanedPhone,
                details: cleanPersonalDetails(signup),
                isReapplication: Boolean(account)
            });
            account = { rider: null, application };
        }

        await riderOtpRepository.markConsumed(client, { otpId: otp.otp_id });
        const session = await createSession(client, { phone: cleanedPhone, deviceInfo: cleanDevice, ipAddress });

        return { ...session, account: toAccount(account) };
    });

    if (outcome.error) {
        throw outcome.error;
    }

    return outcome;
}

// The signed-in phone behind an app token, or null if the token is missing, expired or signed out,
// or the rider has since been terminated. Using the session keeps it alive.
async function getSessionRider(token) {
    if (!token) {
        return null;
    }

    const tokenHash = hashToken(token);
    const session = await riderSessionRepository.findActive(pool, { tokenHash });
    const account = session && await findAccount(pool, session.phone);

    if (!account || account.rider?.status === 'Terminated') {
        return null;
    }

    await riderSessionRepository.extend(pool, { tokenHash, sessionDays: SESSION_DAYS });

    return {
        phone: session.phone,
        riderId: account.rider?.rider_id ?? null,
        applicationId: account.application?.application_id ?? null,
        account: toAccount(account)
    };
}

// Safe to call with an unknown or already signed-out token.
async function logout(token) {
    if (token) {
        await riderSessionRepository.revoke(pool, { tokenHash: hashToken(token) });
    }
}

module.exports = {
    MAX_WRONG_CODES,
    MAX_SENDS_PER_PHONE,
    MAX_SENDS_PER_IP,
    requestOtp,
    verifyOtp,
    getSessionRider,
    logout,
    cleanPersonalDetails
};
