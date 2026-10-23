
const {
    calculateRentalCharge
} = require('./utils/calculateRentalCharge');

const tests = [
    {
        name: 'Active rider with one assignment',
        input: {
            assignmentCount: 1,
            riderStatus: 'Active',
            terminatedOn: null,
            usageDate: '2026-10-12'
        },
        expected: true
    },
    {
        name: 'Inactive rider with one assignment',
        input: {
            assignmentCount: 1,
            riderStatus: 'Inactive',
            terminatedOn: null,
            usageDate: '2026-10-12'
        },
        expected: true
    },
    {
        name: 'Terminated rider on termination date',
        input: {
            assignmentCount: 1,
            riderStatus: 'Terminated',
            terminatedOn: '2026-10-14',
            usageDate: '2026-10-14'
        },
        expected: true
    },
    {
        name: 'Terminated rider after termination date',
        input: {
            assignmentCount: 1,
            riderStatus: 'Terminated',
            terminatedOn: '2026-10-13',
            usageDate: '2026-10-14'
        },
        expected: false
    },
    {
        name: 'Terminated rider without termination date',
        input: {
            assignmentCount: 1,
            riderStatus: 'Terminated',
            terminatedOn: null,
            usageDate: '2026-10-14'
        },
        expected: false
    },
    {
        name: 'No assignment',
        input: {
            assignmentCount: 0,
            riderStatus: 'Active',
            terminatedOn: null,
            usageDate: '2026-10-12'
        },
        expected: false
    },
    {
        name: 'Bike change - two assignments on same day',
        input: {
            assignmentCount: 2,
            riderStatus: 'Active',
            terminatedOn: null,
            usageDate: '2026-10-12'
        },
        expected: true
    }
];

let passed = 0;

for (const test of tests) {
    const result = calculateRentalCharge(test.input);

    const success =
        result.eligible === test.expected &&
        result.rentalCharge ===
            (test.expected ? 59 : 0);

    console.log(
        `${success ? 'PASS' : 'FAIL'}: ${test.name}`
    );

    if (success) passed++;
}

console.log(`\nResults: ${passed}/${tests.length} tests passed`);
