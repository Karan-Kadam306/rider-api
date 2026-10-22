require('dotenv').config();

const {
    calculateWeeklyEnergyCharges
} = require('./services/energyService');

async function testEnergyStatuses() {
    try {
        const result = await calculateWeeklyEnergyCharges({
            weekStart: '2026-10-12',
            includeAllStatuses: true
        });

        console.log('Energy status validation test:');
        console.dir(result, { depth: null });

        const pendingRecord = result.details.find(
            record => String(record.kmRecordId) === '5'
        );

        const reviewRecords = result.details.filter(
            record =>
                record.reason &&
                record.reason.includes('Needs Review')
        );

        if (
            pendingRecord &&
            pendingRecord.eligible === false &&
            pendingRecord.energyCharge === 0 &&
            pendingRecord.reason.includes('Pending')
        ) {
            console.log(
                'PASS: Pending record was skipped before assignment checks.'
            );
        } else {
            console.log(
                'FAIL: Pending record did not produce the expected result.'
            );
        }

        console.log(
            `Needs Review records skipped with matching status reason: ${reviewRecords.length}`
        );
    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

testEnergyStatuses();
