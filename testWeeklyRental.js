
const {
    calculateWeeklyRental
} = require('./utils/calculateWeeklyRental');

// Test 1: Rider is eligible for all 7 days.
const test1 = calculateWeeklyRental({
    weekStart: '2026-10-12',
    riderStatus: 'Active',
    eligibleDates: [
        '2026-10-12',
        '2026-10-13',
        '2026-10-14',
        '2026-10-15',
        '2026-10-16',
        '2026-10-17',
        '2026-10-18'
    ]
});

console.log('Test 1 - Full week:', test1);

// Test 2: Rider is terminated on Wednesday.
const test2 = calculateWeeklyRental({
    weekStart: '2026-10-12',
    riderStatus: 'Terminated',
    terminatedOn: '2026-10-14',
    eligibleDates: [
        '2026-10-12',
        '2026-10-13',
        '2026-10-14',
        '2026-10-15',
        '2026-10-16',
        '2026-10-17',
        '2026-10-18'
    ]
});

console.log('Test 2 - Terminated Wednesday:', test2);

// Test 3: Tuesday and Wednesday are approved inactive days.
const test3 = calculateWeeklyRental({
    weekStart: '2026-10-12',
    riderStatus: 'Active',
    inactivePeriods: [
        {
            startDate: '2026-10-13',
            endDate: '2026-10-14',
            approved: true
        }
    ],
    eligibleDates: [
        '2026-10-12',
        '2026-10-13',
        '2026-10-14',
        '2026-10-15',
        '2026-10-16',
        '2026-10-17',
        '2026-10-18'
    ]
});

console.log('Test 3 - Two inactive days:', test3);
