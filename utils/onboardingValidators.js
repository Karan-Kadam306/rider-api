// Field rules for rider onboarding. Each returns an error message, or null when the value is fine.
// The rider app copies these rules so riders see mistakes before they submit.
// Dates are 'YYYY-MM-DD' strings; "today" is passed in so the rules are easy to test.
const { normalise } = require('./hashIdentifier');

const MIN_AGE = 18;
const MAX_AGE = 70;
const MIN_DL_VALID_DAYS = 30;

// Verhoeff checksum tables, used by Aadhaar's last digit.
const VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];

const VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

// True when the digit string, including its check digit, passes Verhoeff.
function verhoeffValid(digits) {
    let check = 0;

    [...digits].reverse().forEach((digit, index) => {
        check = VERHOEFF_D[check][VERHOEFF_P[index % 8][Number(digit)]];
    });

    return check === 0;
}

function validateAadhaar(value) {
    const clean = normalise(value ?? '');

    if (!/^[2-9]\d{11}$/.test(clean) || !verhoeffValid(clean)) {
        return 'Enter a valid 12-digit Aadhaar number';
    }

    return null;
}

// The 4th letter is P for an individual's PAN.
function validatePan(value) {
    return /^[A-Z]{3}P[A-Z]\d{4}[A-Z]$/.test(normalise(value ?? '')) ? null : 'Enter a valid PAN, e.g. ABCPE1234F';
}

// State code, then 8–18 letters and digits. Kept loose because older licences use other layouts.
function validateDlNumber(value) {
    return /^[A-Z]{2}[0-9A-Z]{8,18}$/.test(normalise(value ?? '')) ? null : 'Enter a valid driving licence number';
}

function validateIfsc(value) {
    return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalise(value ?? '')) ? null : 'Enter a valid 11-character IFSC';
}

function validateBankAccount(value) {
    return /^\d{9,18}$/.test(normalise(value ?? '')) ? null : 'Enter a valid bank account number (9–18 digits)';
}

function validatePincode(value) {
    return /^[1-9]\d{5}$/.test(String(value ?? '').trim()) ? null : 'Enter a valid 6-digit pincode';
}

// Same rule as rider and hub phones.
function validatePhone(value) {
    return /^[6-9]\d{9}$/.test(String(value ?? '').trim()) ? null : 'Enter a valid 10-digit mobile number';
}

function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
        return null;
    }

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    // Rejects dates like 2026-02-30, which Date would roll into March.
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? { year, month, day, date } : null;
}

function ageOn(dob, today) {
    const hadBirthday = today.month > dob.month || (today.month === dob.month && today.day >= dob.day);
    return today.year - dob.year - (hadBirthday ? 0 : 1);
}

function validateAge(dateOfBirth, today) {
    const dob = parseDate(dateOfBirth);

    if (!dob || dob.date > parseDate(today).date) {
        return 'Enter a valid date of birth';
    }

    const age = ageOn(dob, parseDate(today));

    if (age < MIN_AGE) {
        return `Riders must be at least ${MIN_AGE} years old`;
    }

    if (age > MAX_AGE) {
        return 'Check the date of birth';
    }

    return null;
}

function validateDlExpiry(expiryDate, today) {
    const expiry = parseDate(expiryDate);

    if (!expiry) {
        return 'Enter a valid expiry date';
    }

    const daysLeft = (expiry.date - parseDate(today).date) / (24 * 60 * 60 * 1000);

    if (daysLeft < MIN_DL_VALID_DAYS) {
        return `The driving licence must be valid for at least ${MIN_DL_VALID_DAYS} more days`;
    }

    return null;
}

module.exports = {
    verhoeffValid,
    validateAadhaar,
    validatePan,
    validateDlNumber,
    validateIfsc,
    validateBankAccount,
    validatePincode,
    validatePhone,
    validateAge,
    validateDlExpiry
};
