const { pool } = require('../db');
const AppError = require('../errors/AppError');
const rentalRepository = require('../repositories/rentalRepository');
const billingRepository = require('../repositories/billingRepository');
const payoutRepository = require('../repositories/payoutRepository');
const { diffPayout, toPaidAmounts } = require('../utils/diffPayout');
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

// The week runs Monday to Sunday; it has ended from the next Monday.
function hasWeekEnded(weekStart) {
    return todayInIst() >= addDays(weekStart, 7);
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
        totalKm: 0,
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
        totals.totalKm += totalKm;
        totals.totalEnergyCharge += totalEnergyCharge;
        totals.totalAmount += totalAmount;
    }

    return {
        weekStart,
        riderCount: riders.length,
        reviewCount: riders.filter(rider => rider.requiresReview).length,
        totalRental: roundAmount(totals.totalRental),
        totalKm: roundAmount(totals.totalKm),
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

const BILL_VIEWS = ['all', 'needsReview', 'changed', 'payoutPending'];

function isPositiveInteger(value) {
    return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function matchesView(rider, view) {
    if (view === 'needsReview') {
        return rider.requiresReview;
    }

    if (view === 'changed') {
        return rider.changedSinceClose === true;
    }

    if (view === 'payoutPending') {
        return rider.payoutPending;
    }

    return true;
}

// Each rider's current payout, and the week's payout status.
// Riders with a deduction who no longer have a bill are added with zero amounts.
// Before the first payout, payout is null and nothing is pending.
async function addPayouts({ weekStart, closed, riders }) {
    const [runs, items] = await Promise.all([
        payoutRepository.findRuns(pool, { weekStart }),
        payoutRepository.findItems(pool, { weekStart })
    ]);

    const itemByRider = new Map(items.map(item => [item.rider_id, item]));
    const paid = runs.length > 0;

    const withPaidOnly = [...riders];

    for (const item of items) {
        if (!riders.some(rider => rider.riderId === item.rider_id)) {
            withPaidOnly.push({
                riderId: item.rider_id,
                rentalDays: 0,
                totalRental: 0,
                totalKm: 0,
                totalEnergyCharge: 0,
                totalAmount: 0,
                requiresReview: false,
                ...(closed ? { billed: null, changedSinceClose: false, difference: 0 } : {})
            });
        }
    }

    const pending = paid
        ? diffPayout(withPaidOnly, new Map(items.map(item => [item.rider_id, toPaidAmounts(item)])))
        : [];
    const pendingIds = new Set(pending.map(change => change.riderId));

    const lastRun = runs.at(-1);

    return {
        payout: {
            paid,
            runCount: runs.length,
            firstPaidAt: runs[0]?.triggered_at ?? null,
            lastRunAt: lastRun?.triggered_at ?? null,
            totalAmount: lastRun?.total_amount ?? null,
            pendingCount: pending.length,
            pendingDifference: roundAmount(pending.reduce((sum, change) => sum + change.difference, 0))
        },
        riders: withPaidOnly.map(rider => {
            const item = itemByRider.get(rider.riderId);

            return {
                ...rider,
                payout: item
                    ? {
                        ...toPaidAmounts(item),
                        previousTotalAmount: item.previous_total_amount,
                        updatedRunNumber: item.updated_run_number,
                        updatedAt: item.updated_at
                    }
                    : null,
                payoutPending: pendingIds.has(rider.riderId)
            };
        })
    };
}

// The week's bills with rider names, narrowed by search and view.
// viewCounts ignore the view filter, so every tab shows its own total.
async function findWeeklyBills({ weekStart, view = 'all', search }) {
    if (!BILL_VIEWS.includes(view)) {
        throw new AppError(`Invalid view. Allowed values: ${BILL_VIEWS.join(', ')}`, 400);
    }

    const { riders: billedRiders, ...billing } = await getWeeklyBillingSummary({ weekStart });
    const { payout, riders } = await addPayouts({ weekStart, closed: billing.closed, riders: billedRiders });
    const summary = { ...billing, payout };

    const riderRows = await billingRepository.findRidersByIds(pool, {
        riderIds: riders.map(rider => rider.riderId)
    });
    const riderById = new Map(riderRows.map(row => [row.rider_id, row]));

    const named = riders.map(rider => ({
        ...rider,
        riderName: riderById.get(rider.riderId)?.name ?? null,
        riderStatus: rider.riderStatus ?? riderById.get(rider.riderId)?.status ?? null
    }));

    const term = typeof search === 'string' ? search.trim().toLowerCase() : '';
    const matching = term
        ? named.filter(rider =>
            rider.riderId.toLowerCase().includes(term) ||
            (rider.riderName ?? '').toLowerCase().includes(term))
        : named;

    const viewCounts = Object.fromEntries(
        BILL_VIEWS.map(name => [name, matching.filter(rider => matchesView(rider, name)).length])
    );

    return {
        summary,
        viewCounts,
        riders: matching.filter(rider => matchesView(rider, view))
    };
}

// One page of the week's bills, plus the week totals and per-view counts for the tabs.
async function listWeeklyBills({ weekStart, view, search, page = 1, limit = 20 }) {
    if (!isPositiveInteger(page) || !isPositiveInteger(limit) || Number(limit) > 100) {
        throw new AppError(
            'Page must be a positive integer and limit must be between 1 and 100',
            400
        );
    }

    page = Number(page);
    limit = Number(limit);

    const offset = (page - 1) * limit;
    const { summary, viewCounts, riders } = await findWeeklyBills({ weekStart, view, search });
    const pageRiders = riders.slice(offset, offset + limit);

    return {
        ...summary,
        viewCounts,
        pagination: {
            page,
            limit,
            offset,
            totalRecords: riders.length,
            totalPages: Math.ceil(riders.length / limit)
        },
        count: pageRiders.length,
        riders: pageRiders
    };
}

// Quote a CSV value when needed. Text starting with = + - @ is prefixed with '
// so spreadsheet apps do not run it as a formula.
function toCsvValue(value) {
    if (value === null || value === undefined) {
        return '';
    }

    let text = String(value);

    if (typeof value === 'string' && /^[=+\-@]/.test(text)) {
        text = `'${text}`;
    }

    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// The week's bills as CSV, with the same view and search as the bills table.
// A closed week adds the billed amounts and differences.
async function exportWeeklyBills({ weekStart, view, search }) {
    const { summary, riders } = await findWeeklyBills({ weekStart, view, search });

    const columns = [
        ['Rider ID', rider => rider.riderId],
        ['Rider Name', rider => rider.riderName],
        ['Rider Status', rider => rider.riderStatus],
        ['Rental Days', rider => rider.rentalDays],
        ['Rental (INR)', rider => rider.totalRental],
        ['KM', rider => rider.totalKm],
        ['Energy (INR)', rider => rider.totalEnergyCharge],
        ['Total (INR)', rider => rider.totalAmount],
        ['Needs Review', rider => (rider.requiresReview ? 'Yes' : 'No')],
        ['Review Reason', rider => rider.reason]
    ];

    if (summary.closed) {
        columns.push(
            ['Billed Total (INR)', rider => rider.billed?.totalAmount],
            ['Difference (INR)', rider => rider.difference],
            ['Changed Since Close', rider => (rider.changedSinceClose ? 'Yes' : 'No')]
        );
    }

    if (summary.payout.paid) {
        columns.push(
            ['Deducted (INR)', rider => rider.payout?.totalAmount],
            ['Payout Pending', rider => (rider.payoutPending ? 'Yes' : 'No')]
        );
    }

    const lines = [
        columns.map(([header]) => header),
        ...riders.map(rider => columns.map(([, getValue]) => getValue(rider)))
    ].map(row => row.map(toCsvValue).join(','));

    return {
        fileName: `billing-${weekStart}.csv`,
        csv: `${lines.join('\r\n')}\r\n`
    };
}

// Close a finished week by saving every rider's bill as billed.
async function closeWeek({ weekStart }) {
    if (!hasWeekEnded(weekStart)) {
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
    calculateWeeklyBills,
    addPayouts,
    hasWeekEnded,
    listWeeklyBills,
    exportWeeklyBills,
    closeWeek
};
