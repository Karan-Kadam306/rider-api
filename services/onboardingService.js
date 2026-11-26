const { pool, inTransaction } = require('../db');
const AppError = require('../errors/AppError');
const applicationRepository = require('../repositories/applicationRepository');
const applicationDocumentRepository = require('../repositories/applicationDocumentRepository');
const pricingRepository = require('../repositories/pricingRepository');
const pricingService = require('./pricingService');
const onboardingCheckService = require('./onboardingCheckService');
const fileStore = require('./storage');
const { todayInIst } = require('./billingService');
const { cleanPersonalDetails } = require('./riderAuthService');
const { encrypt } = require('../utils/encryption');
const { hashIdentifier, last4, normalise } = require('../utils/hashIdentifier');
const { checkUpload } = require('../utils/fileCheck');
const {
    validateAadhaar,
    validatePan,
    validateDlNumber,
    validateDlExpiry,
    validateIfsc,
    validateBankAccount,
    validatePincode,
    validatePhone
} = require('../utils/onboardingValidators');

// The rider app's onboarding steps, in the order the app shows them. Personal details are filled at
// signup, so that step is always done; it can still be corrected, or sent back by a reviewer.
const STEPS = ['personal', 'address', 'aadhaar', 'pan', 'dl', 'selfie', 'emergency_contact', 'policies', 'bank', 'plan'];

// The document each step uploads.
const STEP_DOCUMENTS = { address: 'address_proof', aadhaar: 'aadhaar', pan: 'pan', dl: 'dl', selfie: 'selfie' };

const ID_VALIDATORS = { aadhaar: validateAadhaar, pan: validatePan, dl: validateDlNumber };

// Photo sides each ID document needs; true = required.
const ID_SIDES = {
    aadhaar: { front: true, back: true },
    pan: { front: true },
    dl: { front: true, back: true }
};

const ADDRESS_PROOF_KINDS = ['Aadhaar', 'Electricity Bill', 'Rent Agreement', 'Bank Statement', 'Other'];
const PLAN_TYPES = ['Postpaid', 'Prepaid'];

// current_step is the first step not done yet; 'summary' means every step is done.
function stepIndex(step) {
    return step === 'summary' ? STEPS.length : STEPS.indexOf(step);
}

function cleanText(value, field, maxLength, { required = true } = {}) {
    const clean = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

    if (required && !clean) {
        throw new AppError(`${field} is required`, 400);
    }

    if (clean.length > maxLength) {
        throw new AppError(`${field} must be at most ${maxLength} characters`, 400);
    }

    return clean || null;
}

function assertValid(error) {
    if (error) {
        throw new AppError(error, 400);
    }
}

// A Draft can change any step up to the first unfinished one. After review, only the steps sent
// back can change. Anything else is with the reviewer, or closed.
function assertCanEdit(application, step) {
    if (application.status === 'Draft') {
        if (stepIndex(step) > stepIndex(application.current_step)) {
            throw new AppError('Finish the earlier steps first', 409);
        }

        return;
    }

    if (application.status === 'Changes Requested') {
        if (!application.fix_steps.includes(step)) {
            throw new AppError('Only the items sent back can be changed', 409);
        }

        return;
    }

    throw new AppError('Your application can no longer be changed', 409);
}

// Saving the current step moves on to the next one; saving a step sent back clears it.
function progressAfterSaving(application, step) {
    const isCurrentStep = application.status === 'Draft' && step === application.current_step;

    return {
        currentStep: isCurrentStep ? STEPS[stepIndex(step) + 1] ?? 'summary' : application.current_step,
        fixSteps: application.fix_steps.filter(fixStep => fixStep !== step)
    };
}

// Checks each uploaded file by its content. sides: { front: true, back: false }, true = required.
function checkFiles(uploads, sides, { allowPdf = true } = {}) {
    const files = [];

    for (const [side, required] of Object.entries(sides)) {
        const buffer = uploads?.[side];

        if (!buffer) {
            if (required) {
                throw new AppError(`The ${side} photo is required`, 400);
            }

            continue;
        }

        files.push({ side, buffer, ...checkUpload(buffer, { allowPdf }) });
    }

    return files;
}

// Saves one step. Files are written first, so the transaction stays short; if anything fails
// afterwards (including a step the rider may not change), the new files are deleted again.
async function saveStep({ applicationId, step, files = [] }, work) {
    const stored = [];

    try {
        for (const file of files) {
            stored.push({ ...file, storageKey: await fileStore.save(file.buffer, file.ext) });
        }

        await inTransaction(async client => {
            const application = await applicationRepository.findForUpdate(client, { applicationId });

            assertCanEdit(application, step);
            await work(client, application, stored);
            await applicationRepository.updateProgress(client, {
                applicationId,
                ...progressAfterSaving(application, step)
            });
        });
    } catch (error) {
        await Promise.all(stored.map(file => fileStore.delete(file.storageKey)));
        throw error;
    }

    return getOnboarding(applicationId);
}

// A new version of the document, with its files. number is already normalised.
async function saveDocument(client, { applicationId, docType, number = null, expiryDate = null, files }) {
    const previousVersion = await applicationDocumentRepository.retireCurrentDocument(client, { applicationId, docType });

    const documentId = await applicationDocumentRepository.insertDocument(client, {
        applicationId,
        docType,
        numberEnc: number && encrypt(number),
        numberHash: number && hashIdentifier(docType, number),
        numberLast4: number && last4(number),
        expiryDate,
        version: previousVersion + 1
    });

    for (const file of files) {
        await applicationDocumentRepository.insertFile(client, {
            documentId,
            side: file.side,
            storageKey: file.storageKey,
            sha256: file.sha256,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes
        });
    }
}

async function savePersonal({ applicationId, details }) {
    const personal = cleanPersonalDetails(details);

    return saveStep({ applicationId, step: 'personal' }, client =>
        applicationRepository.updatePersonal(client, { applicationId, ...personal })
    );
}

async function saveAddress({ applicationId, body, uploads }) {
    const address = {
        addressLine1: cleanText(body?.addressLine1, 'addressLine1', 200),
        addressLine2: cleanText(body?.addressLine2, 'addressLine2', 200, { required: false }),
        city: cleanText(body?.city, 'city', 60),
        state: cleanText(body?.state, 'state', 60),
        pincode: String(body?.pincode ?? '').trim(),
        addressProofKind: body?.addressProofKind
    };

    assertValid(validatePincode(address.pincode));

    if (!ADDRESS_PROOF_KINDS.includes(address.addressProofKind)) {
        throw new AppError(`addressProofKind must be one of: ${ADDRESS_PROOF_KINDS.join(', ')}`, 400);
    }

    const files = checkFiles(uploads, { front: true, back: false });

    return saveStep({ applicationId, step: 'address', files }, async (client, application, stored) => {
        await applicationRepository.updateAddress(client, { applicationId, ...address });
        await saveDocument(client, { applicationId, docType: 'address_proof', files: stored });
    });
}

// Aadhaar, PAN or DL: the number and photos of the card.
async function saveIdDocument({ applicationId, docType, number, expiryDate, uploads }) {
    assertValid(ID_VALIDATORS[docType](number));

    if (docType === 'dl') {
        assertValid(validateDlExpiry(expiryDate, todayInIst()));
    }

    const files = checkFiles(uploads, ID_SIDES[docType]);

    return saveStep({ applicationId, step: docType, files }, (client, application, stored) =>
        saveDocument(client, {
            applicationId,
            docType,
            number: normalise(number),
            expiryDate: docType === 'dl' ? expiryDate : null,
            files: stored
        })
    );
}

// The selfie must be a photo, never a PDF.
async function saveSelfie({ applicationId, photo }) {
    const files = checkFiles({ single: photo }, { single: true }, { allowPdf: false });

    return saveStep({ applicationId, step: 'selfie', files }, (client, application, stored) =>
        saveDocument(client, { applicationId, docType: 'selfie', files: stored })
    );
}

async function saveEmergencyContact({ applicationId, body }) {
    const contact = {
        name: cleanText(body?.name, 'name', 100),
        relation: cleanText(body?.relation, 'relation', 40),
        phone: String(body?.phone ?? '').trim()
    };

    assertValid(validatePhone(contact.phone));

    return saveStep({ applicationId, step: 'emergency_contact' }, (client, application) => {
        if (contact.phone === application.phone) {
            throw new AppError('The emergency contact must have a different phone number from yours', 400);
        }

        return applicationRepository.updateEmergencyContact(client, { applicationId, ...contact });
    });
}

// Records which policy version the rider accepted, and the prices in effect when they did.
async function acceptPolicy({ applicationId, policyVersionId, ipAddress, deviceInfo }) {
    const policy = await applicationRepository.findCurrentPolicy(pool);

    if (!policy || Number(policyVersionId) !== policy.policy_version_id) {
        throw new AppError('Please accept the latest policies', 400);
    }

    const { currentPostpaidRate, currentDeposit } = await pricingService.getPricing();

    return saveStep({ applicationId, step: 'policies' }, client =>
        applicationRepository.upsertPolicyAcceptance(client, {
            applicationId,
            policyVersionId: policy.policy_version_id,
            ipAddress,
            deviceInfo: typeof deviceInfo === 'string' ? deviceInfo.slice(0, 200) : null,
            postpaidRateId: currentPostpaidRate.rateId,
            depositId: currentDeposit?.depositId ?? null
        })
    );
}

async function saveBank({ applicationId, body }) {
    const accountNumber = normalise(body?.accountNumber ?? '');
    const ifsc = normalise(body?.ifsc ?? '');
    const holderName = cleanText(body?.holderName, 'holderName', 100);

    assertValid(validateBankAccount(accountNumber));
    assertValid(validateIfsc(ifsc));

    return saveStep({ applicationId, step: 'bank' }, async client => {
        const previousVersion = await applicationDocumentRepository.retireCurrentBankAccount(client, { applicationId });

        await applicationDocumentRepository.insertBankAccount(client, {
            applicationId,
            accountEnc: encrypt(accountNumber),
            accountHash: hashIdentifier('bank', accountNumber),
            accountLast4: last4(accountNumber),
            ifsc,
            holderName,
            version: previousVersion + 1
        });
    });
}

// Postpaid, or Prepaid with the first weekly pack the rider will buy.
async function savePlan({ applicationId, planType, packId }) {
    if (!PLAN_TYPES.includes(planType)) {
        throw new AppError('planType must be Postpaid or Prepaid', 400);
    }

    if (planType === 'Postpaid' && packId != null) {
        throw new AppError('A postpaid plan has no pack', 400);
    }

    return saveStep({ applicationId, step: 'plan' }, async client => {
        if (planType === 'Prepaid') {
            const pack = /^\d{1,15}$/.test(String(packId))
                ? await pricingRepository.findPrepaidPackById(client, { packId: Number(packId) })
                : null;

            if (!pack || !pack.is_active || pack.kind !== 'Weekly') {
                throw new AppError('Choose one of the available weekly packs', 400);
            }
        }

        await applicationRepository.updatePlan(client, {
            applicationId,
            planType,
            packId: planType === 'Prepaid' ? Number(packId) : null
        });
    });
}

// Sends the application for review: a Draft once every step is done, or a returned application
// once every item sent back is fixed. Verifications run after the submit is saved.
async function submit({ applicationId }) {
    await inTransaction(async client => {
        const application = await applicationRepository.findForUpdate(client, { applicationId });
        let status;

        if (application.status === 'Draft') {
            if (application.current_step !== 'summary') {
                throw new AppError('Complete every step before submitting', 409);
            }

            status = 'Pending Review';
        } else if (application.status === 'Changes Requested') {
            if (application.fix_steps.length) {
                throw new AppError('Fix every item sent back before submitting', 409);
            }

            status = 'Resubmitted';
        } else {
            throw new AppError('This application has already been submitted', 409);
        }

        await applicationRepository.markSubmitted(client, { applicationId, status });
        await applicationRepository.insertEvent(client, {
            applicationId,
            eventType: status === 'Resubmitted' ? 'resubmitted' : 'submitted',
            fromStatus: application.status,
            toStatus: status,
            actorType: 'rider'
        });
        await onboardingCheckService.runDuplicateCheck(client, { applicationId });
    });

    await onboardingCheckService.runVerifications({ applicationId });

    return getOnboarding(applicationId);
}

function stepState(application, step) {
    if (application.fix_steps.includes(step)) {
        return 'fix';
    }

    if (application.status !== 'Draft') {
        return 'done';
    }

    const current = stepIndex(application.current_step);
    const index = stepIndex(step);

    return index < current ? 'done' : index === current ? 'current' : 'todo';
}

function toDocument(row) {
    return {
        numberLast4: row.number_last4,
        expiryDate: row.expiry_date,
        reviewStatus: row.review_status,
        reviewReason: row.review_reason,
        sides: row.sides ?? []
    };
}

// Everything the app needs to pick a screen and draw the summary. Full ID and account numbers,
// and the files themselves, are never sent back.
async function getOnboarding(applicationId) {
    const application = await applicationRepository.findOnboarding(pool, { applicationId });
    const documentRows = await applicationDocumentRepository.findCurrentDocuments(pool, { applicationId });
    const bank = await applicationDocumentRepository.findCurrentBankAccount(pool, { applicationId });

    const documents = Object.fromEntries(documentRows.map(row => [row.doc_type, toDocument(row)]));
    // Why a step was sent back: its document's (or the bank account's) rejection reason.
    const reasonFor = key => (key === 'bank' ? bank?.review_reason : documents[STEP_DOCUMENTS[key]]?.reviewReason) ?? null;

    return {
        applicationNo: application.application_no,
        status: application.status,
        currentStep: application.current_step,
        holdReason: application.hold_reason,
        rejectReason: application.reject_reason,
        changeNote: application.change_note,
        submittedAt: application.submitted_at,
        steps: STEPS.map(key => {
            const state = stepState(application, key);
            return { key, state, reason: state === 'fix' ? reasonFor(key) : null };
        }),
        details: {
            personal: {
                firstName: application.first_name,
                surname: application.surname,
                dateOfBirth: application.date_of_birth,
                phone: application.phone
            },
            address: application.address_line1 && {
                addressLine1: application.address_line1,
                addressLine2: application.address_line2,
                city: application.city,
                state: application.state,
                pincode: application.pincode,
                addressProofKind: application.address_proof_kind
            },
            documents,
            emergencyContact: application.emergency_name && {
                name: application.emergency_name,
                relation: application.emergency_relation,
                phone: application.emergency_phone
            },
            policy: application.policy_version && {
                version: application.policy_version,
                acceptedAt: application.policy_accepted_at
            },
            bank: bank && {
                accountLast4: bank.account_last4,
                ifsc: bank.ifsc,
                holderName: bank.holder_name
            },
            plan: application.plan_type && {
                planType: application.plan_type,
                pack: application.pack_id && {
                    packId: application.pack_id,
                    name: application.pack_name,
                    price: application.pack_price,
                    kmIncluded: application.pack_km_included
                }
            }
        }
    };
}

// What the plan step shows: today's postpaid rate, the weekly packs on sale and the deposit.
async function getPlans() {
    const { currentPostpaidRate, currentDeposit, prepaidPacks } = await pricingService.getPricing();

    return {
        postpaid: {
            rentalPerDay: currentPostpaidRate.rentalPerDay,
            energyPerKm: currentPostpaidRate.energyPerKm
        },
        prepaidPacks: prepaidPacks
            .filter(pack => pack.isActive && pack.kind === 'Weekly')
            .map(pack => ({
                packId: pack.packId,
                name: pack.name,
                price: pack.price,
                kmIncluded: pack.kmIncluded,
                validityDays: pack.validityDays
            })),
        depositAmount: currentDeposit?.amount ?? null
    };
}

async function getCurrentPolicy() {
    const policy = await applicationRepository.findCurrentPolicy(pool);

    if (!policy) {
        throw new AppError('No policies have been published yet', 404);
    }

    return {
        policyVersionId: policy.policy_version_id,
        version: policy.version,
        title: policy.title,
        body: policy.body,
        effectiveFrom: policy.effective_from
    };
}

module.exports = {
    STEPS,
    STEP_DOCUMENTS,
    getOnboarding,
    savePersonal,
    saveAddress,
    saveIdDocument,
    saveSelfie,
    saveEmergencyContact,
    acceptPolicy,
    saveBank,
    savePlan,
    submit,
    getPlans,
    getCurrentPolicy
};
