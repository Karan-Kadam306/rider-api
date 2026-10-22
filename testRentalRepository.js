require('dotenv').config();

const { pool } = require('./db');
const {
    findEligibleRentalDates
} = require('./repositories/rentalRepository');

async function testRentalRepository() {
    try {
        const client = await pool.connect();

        try {
            const eligibleDates = await findEligibleRentalDates(client, {
                riderId: 'YS-TEST-001',
                weekStart: '2026-10-12'
            });

            console.log('Eligible rental dates:', eligibleDates);
            console.log('Number of eligible days:', eligibleDates.length);
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await pool.end();
    }
}

testRentalRepository();
