const { pool } = require('../db');
const AppError = require('../errors/AppError');
const rentalRepository = require('../repositories/rentalRepository');
const { calculateRiderWeeklyRental } = require('./rentalService');
const { calculateWeeklyEnergyCharges } = require('./energyService');

function roundAmount(amount) {
    return Math.round(amount * 100) / 100;
}

// Weekly bill for one rider: rental + energy.
async function getRiderBill({ riderId, weekStart }) {
    const rental = await calculateRiderWeeklyRental({
        riderId,
        weekStart
    });

    const energy = await calculateWeeklyEnergyCharges({
        weekStart,
        riderId
    });

    return {
        riderId,
        weekStart,
        rental,
        energy,
        totalAmount: roundAmount(rental.totalRental + energy.totalEnergyCharge)
    };
}

// Weekly bill summary for every rider who held a bike that week.
async function getWeeklyBillingSummary({ weekStart }) {
    const riderIds =
        await rentalRepository.findRiderIdsWithAssignmentsInWeek(pool, {
            weekStart
        });

    const energy = await calculateWeeklyEnergyCharges({ weekStart });

    const riders = [];
    const totals = {
        totalRental: 0,
        totalEnergyCharge: 0,
        totalAmount: 0
    };

    for (const riderId of riderIds) {
        const chargedRecords = energy.details.filter(
            record => record.riderId === riderId && record.eligible
        );

        const totalKm = roundAmount(
            chargedRecords.reduce((sum, record) => sum + record.dailyKm, 0)
        );

        const totalEnergyCharge = roundAmount(
            chargedRecords.reduce((sum, record) => sum + record.energyCharge, 0)
        );

        let rental;

        try {
            rental = await calculateRiderWeeklyRental({ riderId, weekStart });
        } catch (error) {
            // One rider with bad data should not block the whole summary.
            if (!(error instanceof AppError)) {
                throw error;
            }

            riders.push({
                riderId,
                requiresReview: true,
                reason: error.message
            });

            continue;
        }

        const totalAmount = roundAmount(rental.totalRental + totalEnergyCharge);

        riders.push({
            riderId,
            riderStatus: rental.riderStatus,
            rentalDays: rental.rentalDays,
            totalRental: rental.totalRental,
            totalKm,
            totalEnergyCharge,
            totalAmount,
            requiresReview: false
        });

        totals.totalRental += rental.totalRental;
        totals.totalEnergyCharge += totalEnergyCharge;
        totals.totalAmount += totalAmount;
    }

    return {
        weekStart,
        riderCount: riders.length,
        reviewCount: riders.filter(rider => rider.requiresReview).length,
        totalRental: roundAmount(totals.totalRental),
        totalEnergyCharge: roundAmount(totals.totalEnergyCharge),
        totalAmount: roundAmount(totals.totalAmount),
        riders
    };
}

module.exports = {
    getRiderBill,
    getWeeklyBillingSummary
};
