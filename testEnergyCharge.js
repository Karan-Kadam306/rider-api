const {
    calculateEnergyCharge
} = require('./utils/calculateEnergyCharge');

const mockRecords = [
    {
        name: 'Active rider - validated record',
        dailyKm: 25,
        recordStatus: 'Validated',
        bikeId: 1,
        riderId: 'YS-TEST-001',
        expectedCharge: 37.50
    },
    {
        name: 'Inactive rider - valid historical assignment',
        dailyKm: 20,
        recordStatus: 'Validated',
        bikeId: 2,
        riderId: 'YS-TEST-002',
        expectedCharge: 30.00
    },
    {
        name: 'Terminated rider - historical record',
        dailyKm: 30,
        recordStatus: 'Validated',
        bikeId: 3,
        riderId: 'YS-TEST-003',
        expectedCharge: 45.00
    },
    {
        name: 'Pending record',
        dailyKm: 18,
        recordStatus: 'Pending',
        bikeId: 1,
        riderId: 'YS-TEST-001',
        expectedCharge: 0
    },
    {
        name: 'Needs Review record',
        dailyKm: 40,
        recordStatus: 'Needs Review',
        bikeId: 1,
        riderId: 'YS-TEST-001',
        expectedCharge: 0
    },
    {
        name: 'Validated record with unknown bike',
        dailyKm: 50,
        recordStatus: 'Validated',
        bikeId: null,
        riderId: null,
        expectedCharge: 0
    },
    {
        name: 'Corrected record - latest KM value',
        dailyKm: 35,
        recordStatus: 'Validated',
        bikeId: 2,
        riderId: 'YS-TEST-002',
        expectedCharge: 52.50
    }
];

let passed = 0;

for (const record of mockRecords) {
    const result = calculateEnergyCharge(record);

    const testPassed =
        result.energyCharge === record.expectedCharge;

    if (testPassed) {
        passed++;
    }

    console.log(
        `${testPassed ? 'PASS' : 'FAIL'}: ${record.name}`
    );

    console.log('Expected:', record.expectedCharge);
    console.log('Actual:', result.energyCharge);
    console.log('Eligible:', result.eligible);
    console.log('---');
}

console.log(`${passed}/${mockRecords.length} tests passed.`);
