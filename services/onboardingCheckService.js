const { pool } = require('../db');
const applicationRepository = require('../repositories/applicationRepository');
const applicationDocumentRepository = require('../repositories/applicationDocumentRepository');
const kycClient = require('./integrations/kycClient');
const { decrypt } = require('../utils/encryption');

// Checks run when a rider submits. They only flag things for the reviewer: an application is
// never rejected here, and a provider being down is recorded as Failed rather than blocking submit.

// Same Aadhaar, PAN, DL or bank account on another application. Runs inside the submit transaction.
async function runDuplicateCheck(client, { applicationId }) {
    const matches = await applicationDocumentRepository.findDuplicates(client, { applicationId });

    await applicationRepository.insertCheck(client, {
        applicationId,
        kind: 'duplicate',
        status: matches.length ? 'Flagged' : 'Clear',
        details: {
            matches: matches.map(match => ({
                field: match.field,
                applicationNo: match.application_no,
                applicationStatus: match.application_status,
                riderId: match.rider_id,
                riderStatus: match.rider_status
            }))
        }
    });
}

function nameWords(name) {
    return name.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
}

// The bank's name must contain every word of the rider's name, in any order ("KUMAR RAVI" matches).
function namesMatch(nameAtBank, { firstName, surname }) {
    const bankWords = new Set(nameWords(nameAtBank));
    return nameWords(`${firstName} ${surname}`).every(word => bankWords.has(word));
}

async function verifyBank({ applicationId, profile }) {
    const account = await applicationDocumentRepository.findCurrentBankAccount(pool, { applicationId });

    try {
        const { nameAtBank } = await kycClient.verifyBankAccount({
            accountNumber: decrypt(account.account_enc),
            ifsc: account.ifsc,
            holderName: account.holder_name
        });
        const nameMatches = namesMatch(nameAtBank, profile);

        await applicationDocumentRepository.updateBankVerification(pool, {
            bankAccountId: account.bank_account_id,
            verifiedName: nameAtBank,
            verificationStatus: nameMatches ? 'Verified' : 'Mismatch'
        });

        return { status: nameMatches ? 'Clear' : 'Flagged', details: { nameAtBank, nameMatches } };
    } catch (error) {
        await applicationDocumentRepository.updateBankVerification(pool, {
            bankAccountId: account.bank_account_id,
            verifiedName: null,
            verificationStatus: 'Failed'
        });
        throw error;
    }
}

async function verifyIdNumber({ applicationId, docType }) {
    const numbers = await applicationDocumentRepository.findCurrentNumbers(pool, { applicationId });
    const number = decrypt(numbers.find(row => row.doc_type === docType).number_enc);

    const result = docType === 'pan'
        ? await kycClient.verifyPan({ panNumber: number })
        : await kycClient.verifyDrivingLicence({ dlNumber: number });

    return { status: result.valid ? 'Clear' : 'Flagged', details: { valid: result.valid } };
}

// Runs after the submit is saved, so a slow or failing provider never undoes a submit.
async function runVerifications({ applicationId }) {
    const application = await applicationRepository.findOnboarding(pool, { applicationId });
    const profile = { firstName: application.first_name, surname: application.surname };

    const checks = [
        ['bank', () => verifyBank({ applicationId, profile })],
        ['pan', () => verifyIdNumber({ applicationId, docType: 'pan' })],
        ['dl', () => verifyIdNumber({ applicationId, docType: 'dl' })]
    ];

    for (const [kind, verify] of checks) {
        let outcome;

        try {
            outcome = await verify();
        } catch (error) {
            outcome = { status: 'Failed', details: { error: error.message } };
        }

        await applicationRepository.insertCheck(pool, { applicationId, kind, ...outcome });
    }
}

module.exports = {
    runDuplicateCheck,
    runVerifications,
    namesMatch
};
