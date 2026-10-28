const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calculateRentalCharge } = require('../../utils/calculateRentalCharge');
const { calculateEnergyCharge } = require('../../utils/calculateEnergyCharge');
const { calculateWeeklyRental } = require('../../utils/calculateWeeklyRental');
const validateUsageDate = require('../../utils/validateUsageDate');

const FULL_WEEK = [
    '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15',
    '2026-10-16', '2026-10-17', '2026-10-18'
];

describe('calculateRentalCharge', () => {
    const cases = [
        ['Active rider with one assignment', { assignmentCount: 1, riderStatus: 'Active' }, 59],
        ['Inactive rider with one assignment', { assignmentCount: 1, riderStatus: 'Inactive' }, 59],
        ['Bike change: two assignments on one day is charged once', { assignmentCount: 2, riderStatus: 'Active' }, 59],
        ['No assignment', { assignmentCount: 0, riderStatus: 'Active' }, 0],
        ['Terminated on the usage date is charged', { assignmentCount: 1, riderStatus: 'Terminated', terminatedOn: '2026-10-14', usageDate: '2026-10-14' }, 59],
        ['Terminated before the usage date', { assignmentCount: 1, riderStatus: 'Terminated', terminatedOn: '2026-10-13', usageDate: '2026-10-14' }, 0],
        ['Terminated without a termination date', { assignmentCount: 1, riderStatus: 'Terminated', terminatedOn: null, usageDate: '2026-10-14' }, 0]
    ];

    for (const [name, input, expected] of cases) {
        it(name, () => {
            const result = calculateRentalCharge({ terminatedOn: null, usageDate: '2026-10-12', ...input });

            assert.equal(result.rentalCharge, expected);
            assert.equal(result.eligible, expected > 0);
        });
    }
});

describe('calculateEnergyCharge', () => {
    const cases = [
        ['Validated record is charged ₹1.50/km', { dailyKm: 25, recordStatus: 'Validated', bikeId: 1, riderId: 'R1' }, 37.5],
        ['KM given as a string from the database', { dailyKm: '20.00', recordStatus: 'Validated', bikeId: 1, riderId: 'R1' }, 30],
        ['Rounds to 2 decimals', { dailyKm: 33.33, recordStatus: 'Validated', bikeId: 1, riderId: 'R1' }, 50],
        ['Zero KM is a valid zero charge', { dailyKm: 0, recordStatus: 'Validated', bikeId: 1, riderId: 'R1' }, 0],
        ['Pending record is not charged', { dailyKm: 18, recordStatus: 'Pending', bikeId: 1, riderId: 'R1' }, 0],
        ['Needs Review record is not charged', { dailyKm: 40, recordStatus: 'Needs Review', bikeId: 1, riderId: 'R1' }, 0],
        ['Unmatched bike is not charged', { dailyKm: 50, recordStatus: 'Validated', bikeId: null, riderId: null }, 0],
        ['Negative KM is not charged', { dailyKm: -5, recordStatus: 'Validated', bikeId: 1, riderId: 'R1' }, 0],
        ['Non-numeric KM is not charged', { dailyKm: 'abc', recordStatus: 'Validated', bikeId: 1, riderId: 'R1' }, 0]
    ];

    for (const [name, input, expected] of cases) {
        it(name, () => {
            assert.equal(calculateEnergyCharge(input).energyCharge, expected);
        });
    }

    it('Explains why a record is not eligible', () => {
        const result = calculateEnergyCharge({ dailyKm: 10, recordStatus: 'Pending', bikeId: 1, riderId: 'R1' });

        assert.equal(result.eligible, false);
        assert.match(result.reason, /Pending/);
    });
});

describe('calculateWeeklyRental', () => {
    it('Full week is 7 days × ₹59 = ₹413', () => {
        const result = calculateWeeklyRental({ weekStart: '2026-10-12', riderStatus: 'Active', eligibleDates: FULL_WEEK });

        assert.equal(result.rentalDays, 7);
        assert.equal(result.totalRental, 413);
    });

    it('Terminated on Wednesday: Mon–Wed are charged = ₹177', () => {
        const result = calculateWeeklyRental({
            weekStart: '2026-10-12',
            riderStatus: 'Terminated',
            terminatedOn: '2026-10-14',
            eligibleDates: FULL_WEEK
        });

        assert.equal(result.rentalDays, 3);
        assert.equal(result.totalRental, 177);
    });

    it('Only days with an assignment are charged', () => {
        const result = calculateWeeklyRental({
            weekStart: '2026-10-12',
            riderStatus: 'Active',
            eligibleDates: ['2026-10-15', '2026-10-16']
        });

        assert.equal(result.totalRental, 118);
    });

    it('Approved inactive days are not charged, unapproved ones are', () => {
        const result = calculateWeeklyRental({
            weekStart: '2026-10-12',
            riderStatus: 'Active',
            eligibleDates: FULL_WEEK,
            inactivePeriods: [
                { startDate: '2026-10-13', endDate: '2026-10-14', approved: true },
                { startDate: '2026-10-16', endDate: '2026-10-16', approved: false }
            ]
        });

        assert.equal(result.rentalDays, 5);
    });

    it('Rejects a weekStart that is not a Monday', () => {
        assert.throws(
            () => calculateWeeklyRental({ weekStart: '2026-10-13', riderStatus: 'Active' }),
            /Monday/
        );
    });

    it('Rejects an impossible date', () => {
        assert.throws(
            () => calculateWeeklyRental({ weekStart: '2026-02-30', riderStatus: 'Active' }),
            /Monday/
        );
    });
});

describe('validateUsageDate', () => {
    const valid = ['2026-10-12', '2028-02-29'];
    const invalid = ['2026-02-30', '2027-02-29', '2026-2-3', '12-10-2026', '2026-10-12T00:00', '', null, undefined, 20261012];

    for (const value of valid) {
        it(`accepts ${value}`, () => assert.equal(validateUsageDate(value), true));
    }

    for (const value of invalid) {
        it(`rejects ${JSON.stringify(value)}`, () => assert.equal(validateUsageDate(value), false));
    }
});
