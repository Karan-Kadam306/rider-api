const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const v = require('../../utils/onboardingValidators');

// Appends the digit that makes the number pass Verhoeff.
function withCheckDigit(digits) {
    for (let d = 0; d <= 9; d++) {
        if (v.verhoeffValid(digits + d)) {
            return digits + d;
        }
    }

    throw new Error('no check digit');
}

const AADHAAR = withCheckDigit('23412341234');

function wrongLastDigit(number) {
    return number.slice(0, -1) + ((Number(number.at(-1)) + 1) % 10);
}

describe('Verhoeff checksum', () => {
    it('matches published examples', () => {
        assert.equal(v.verhoeffValid('2363'), true);
        assert.equal(v.verhoeffValid('123451'), true);
        assert.equal(v.verhoeffValid('2364'), false);
        assert.equal(v.verhoeffValid('123452'), false);
    });
});

describe('validateAadhaar', () => {
    it('accepts a 12-digit number with a valid check digit, with or without spaces', () => {
        assert.equal(v.validateAadhaar(AADHAAR), null);
        assert.equal(v.validateAadhaar(`${AADHAAR.slice(0, 4)} ${AADHAAR.slice(4, 8)} ${AADHAAR.slice(8)}`), null);
    });

    it('rejects a wrong check digit, a wrong length or a leading 0 or 1', () => {
        const leadingOne = withCheckDigit('13412341234');

        for (const value of [wrongLastDigit(AADHAAR), AADHAAR.slice(1), `${AADHAAR}1`, leadingOne, '', null, 'ABCDEFGHIJKL']) {
            assert.equal(v.validateAadhaar(value), 'Enter a valid 12-digit Aadhaar number', String(value));
        }
    });
});

describe('ID and bank formats', () => {
    const cases = [
        ['PAN', v.validatePan, ['ABCPE1234F', 'abcpe1234f'], ['ABCCE1234F', 'ABCPE123F', '1BCPE1234F', '']],
        ['DL', v.validateDlNumber, ['MH1220190012345', 'MH-12 2019 0012345', 'DL0420110149646'], ['MH12', '1H1220190012345', 'MH12201900123456789012', '']],
        ['IFSC', v.validateIfsc, ['SBIN0001234', 'hdfc0ab12cd'], ['SBIN1001234', 'SBI0001234', 'SBIN00012345']],
        ['bank account', v.validateBankAccount, ['123456789', '123456789012345678', '1234 5678 9012'], ['12345678', '1234567890123456789', '12345ABC9']],
        ['pincode', v.validatePincode, ['411057', ' 560001 '], ['011057', '41105', '4110577', 'ABCDEF']],
        ['phone', v.validatePhone, ['9876543210', '6000000000'], ['5876543210', '987654321', '+919876543210']]
    ];

    for (const [name, validate, good, bad] of cases) {
        it(`${name}: accepts valid and rejects invalid values`, () => {
            for (const value of good) {
                assert.equal(validate(value), null, value);
            }

            for (const value of bad) {
                assert.equal(typeof validate(value), 'string', value);
            }
        });
    }
});

describe('validateAge', () => {
    const today = '2026-11-24';

    it('accepts a rider who turns 18 today, not one who turns 18 tomorrow', () => {
        assert.equal(v.validateAge('2008-11-24', today), null);
        assert.equal(v.validateAge('2008-11-25', today), 'Riders must be at least 18 years old');
    });

    it('handles a 29 February birthday', () => {
        assert.equal(v.validateAge('2008-02-29', '2026-02-28'), 'Riders must be at least 18 years old');
        assert.equal(v.validateAge('2008-02-29', '2026-03-01'), null);
    });

    it('rejects someone over 70, a future date and a date that does not exist', () => {
        assert.equal(v.validateAge('1956-11-24', today), null);
        assert.equal(v.validateAge('1955-11-23', today), 'Check the date of birth');
        assert.equal(v.validateAge('2027-01-01', today), 'Enter a valid date of birth');
        assert.equal(v.validateAge('2000-02-30', today), 'Enter a valid date of birth');
        assert.equal(v.validateAge('24/11/2000', today), 'Enter a valid date of birth');
    });
});

describe('validateDlExpiry', () => {
    const today = '2026-11-24';

    it('needs at least 30 more days', () => {
        assert.equal(v.validateDlExpiry('2026-12-24', today), null);
        assert.equal(v.validateDlExpiry('2026-12-23', today), 'The driving licence must be valid for at least 30 more days');
        assert.equal(v.validateDlExpiry('2025-01-01', today), 'The driving licence must be valid for at least 30 more days');
    });

    it('rejects a date that is not valid', () => {
        assert.equal(v.validateDlExpiry('2026-13-01', today), 'Enter a valid expiry date');
        assert.equal(v.validateDlExpiry(undefined, today), 'Enter a valid expiry date');
    });
});
