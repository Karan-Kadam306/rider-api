
require('dotenv').config();

const {
    calculateWeeklyEnergyCharges
} = require('./services/energyService');

async function testEnergyService() {
    try {
        const result = await calculateWeeklyEnergyCharges({
            weekStart: '2026-10-12'
        });

        console.log('Weekly energy calculation:');
        console.dir(result, { depth: null });

        const testRecord = result.details.find(
            record => record.kmRecordId === '7' ||
                      record.kmRecordId === 7
        );

        if (
            testRecord &&
            testRecord.eligible === true &&
            testRecord.energyCharge === 30
        ) {
            console.log('PASS: Database-backed energy calculation is correct.');
        } else {
            console.log('FAIL: Expected validated record 7 to have a ₹30 charge.');
        }
    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

testEnergyService();
