// Mock of the KYC provider that checks a rider's bank account, PAN and driving licence.
// The real client calls the provider with the same arguments and returns the same shape.
// Set MOCK_KYC_FAIL=true to make every call fail, e.g. to try the Failed check path.

function failIfAsked(action) {
    if (process.env.MOCK_KYC_FAIL === 'true') {
        throw new Error(`KYC ${action} failed (MOCK_KYC_FAIL)`);
    }
}

// Penny drop: sends ₹1 and returns the name the bank holds for the account.
// The mock answers with the holder name the rider typed.
async function verifyBankAccount({ accountNumber, ifsc, holderName }) {
    failIfAsked('bank verification');
    return { accountNumber, ifsc, nameAtBank: holderName.toUpperCase() };
}

async function verifyPan({ panNumber }) {
    failIfAsked('PAN verification');
    return { panNumber, valid: true };
}

async function verifyDrivingLicence({ dlNumber }) {
    failIfAsked('DL verification');
    return { dlNumber, valid: true };
}

module.exports = {
    verifyBankAccount,
    verifyPan,
    verifyDrivingLicence
};
