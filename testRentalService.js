
require('dotenv').config();

const { calculateRiderWeeklyRental } = require('./services/rentalService');

async function testRentalService() {
    try {
        const result = await calculateRiderWeeklyRental({
            riderId: 'YS-TEST-001',
            weekStart: '2026-10-12'
        });

        console.log('Weekly rental result:');
        console.log(result);

        if (
            result.rentalDays === 3 &&
            result.totalRental === 177
        ) {
            console.log('PASS: Rental calculation is correct.');
        } else {
            console.log('FAIL: Rental calculation does not match expectations.');
        }
    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

testRentalService();
