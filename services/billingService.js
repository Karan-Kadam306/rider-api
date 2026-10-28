const { pool } = require('../db');
const AppError = require('../errors/AppError');
const rentalRepository = require('../repositories/rentalRepository');
const billingRepository = require('../repositories/billingRepository');
const { calculateRiderWeeklyRental } = require('./rentalService');
const { calculateWeeklyEnergyCharges } = require('./energyService');

function roundAmount(amount) {
    return Math.round(amount * 100) / 100;
}

function sumChargedKm(records) {
    return roundAmount(records.reduce((sum, record) => sum + record.dailyKm, 0));
}

// Today's date in IST as YYYY-MM-DD.
function todayInIst() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function addDays(date, days) {
    const result = new Date(`${date}T00:00:00.000Z`);
    result.setUTCDate(result.getUTCDate() + days);
    return result.toISOString().slice(0, 10);
}

function toBilledAmounts(snapshot) {
    return {
        rentalDays: snapshot.rental_days,
        totalRental: snapshot.total_rental,
        totalKm: snapshot.total_km,
        totalEnergyCharge: snapshot.total_energy_charge,
        totalAmount: snapshot.total_amount
    };
}

// Compare a rider's live bill with what was billed when the week closed.
// Corrections after closing are allowed; they only show up here.
function compareWithSnapshot(current, snapshot) {
    if (!snapshot) {
        return {
            billed: null,
            changedSinceClose: true,
            difference: current.requiresReview ? null : current.totalAmount
        };
    }

    const billed = toBilledAmounts(snapshot);

    // The live bill cannot be calculated, so it cannot be confirmed unchanged.
    if (current.requiresReview) {
        return { billed, changedSinceClose: true, difference: null };
    }

    const changedSinceClose = [
        'rentalDays',
        'totalRental',
        'totalKm',
        'totalEnergyCharge',
        'totalAmount'
    ].some(field => current[field] !== billed[field]);

    return {
        billed,
        changedSinceClose,
        difference: roundAmount(current.totalAmount - billed.totalAmount)
    };
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

    const bill = {
        riderId,
        weekStart,
        rental,
        energy,
        totalAmount: roundAmount(rental.totalRental + energy.totalEnergyCharge)
    };

    const closure = await billingRepository.findWeekClosure(pool, { weekStart });

    if (!closure) {
        return { ...bill, closed: false, closure: null };
    }

    const [snapshot] = await billingRepository.findWeekSnapshots(pool, {
        weekStart,
        riderId
    });

    const current = {
        requiresReview: false,
        rentalDays: rental.rentalDays,
        totalRental: rental.totalRental,
        totalKm: sumChargedKm(energy.details.filter(record => record.eligible)),
        totalEnergyCharge: energy.totalEnergyCharge,
        totalAmount: bill.totalAmount
    };

    return {
        ...bill,
        closed: true,
        closure: {
            closedAt: closure.closed_at,
            ...compareWithSnapshot(current, snapshot)
        }
    };
}

// Live weekly bills for every rider who held a bike that week.
async function calculateWeeklyBills({ weekStart }) {
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

        const totalKm = sumChargedKm(chargedRecords);

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

// Weekly bill summary, compared with the closed bills if the week is closed.
async function getWeeklyBillingSummary({ weekStart }) {
    const summary = await calculateWeeklyBills({ weekStart });
    const closure = await billingRepository.findWeekClosure(pool, { weekStart });

    if (!closure) {
        return { ...summary, closed: false };
    }

    const snapshots = await billingRepository.findWeekSnapshots(pool, { weekStart });
    const snapshotByRider = new Map(snapshots.map(row => [row.rider_id, row]));

    const riders = summary.riders.map(rider => ({
        ...rider,
        ...compareWithSnapshot(rider, snapshotByRider.get(rider.riderId))
    }));

    // Billed riders who no longer have anything to pay this week.
    for (const snapshot of snapshots) {
        if (summary.riders.some(rider => rider.riderId === snapshot.rider_id)) {
            continue;
        }

        const billed = toBilledAmounts(snapshot);

        riders.push({
            riderId: snapshot.rider_id,
            rentalDays: 0,
            totalRental: 0,
            totalKm: 0,
            totalEnergyCharge: 0,
            totalAmount: 0,
            requiresReview: false,
            billed,
            changedSinceClose: true,
            difference: -billed.totalAmount
        });
    }

    return {
        ...summary,
        riders,
        closed: true,
        closedAt: closure.closed_at,
        billedTotalAmount: closure.total_amount,
        changedCount: riders.filter(rider => rider.changedSinceClose).length
    };
}

// Close a finished week by saving every rider's bill as billed.
async function closeWeek({ weekStart }) {
    // The week runs Monday to Sunday; it can be closed from the next Monday.
    if (todayInIst() < addDays(weekStart, 7)) {
        throw new AppError('Cannot close a week that has not ended', 409);
    }

    const summary = await calculateWeeklyBills({ weekStart });

    if (summary.reviewCount > 0) {
        throw new AppError(
            `Cannot close the week: ${summary.reviewCount} rider(s) require review`,
            409
        );
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const closure = await billingRepository.insertWeekClosure(client, {
            weekStart,
            totalAmount: summary.totalAmount
        });

        if (!closure) {
            await client.query('ROLLBACK');
            throw new AppError('Week is already closed', 409);
        }

        for (const rider of summary.riders) {
            await billingRepository.insertWeekSnapshot(client, {
                weekStart,
                rider
            });
        }

        await client.query('COMMIT');

        return {
            weekStart,
            closedAt: closure.closed_at,
            riderCount: summary.riderCount,
            totalRental: summary.totalRental,
            totalEnergyCharge: summary.totalEnergyCharge,
            totalAmount: summary.totalAmount
        };
    } catch (error) {
        if (!(error instanceof AppError)) {
            await client.query('ROLLBACK');
        }

        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    getRiderBill,
    getWeeklyBillingSummary,
    closeWeek
};
