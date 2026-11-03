const { pool } = require('../db');
const AppError = require('../errors/AppError');
const billingRepository = require('../repositories/billingRepository');
const payoutRepository = require('../repositories/payoutRepository');
const billingService = require('./billingService');
const { diffPayout, toPaidAmounts } = require('../utils/diffPayout');

function roundAmount(amount) {
    return Math.round(amount * 100) / 100;
}

function toRun(row) {
    return {
        runId: row.run_id,
        weekStart: row.week_start,
        runNumber: row.run_number,
        riderCount: row.rider_count,
        updatedCount: row.updated_count,
        totalAmount: row.total_amount,
        triggeredAt: row.triggered_at
    };
}

// Why a payout cannot run now, or null. Mirrored by the admin UI to explain a disabled button.
function getPayoutBlocker({ weekStart, reviewCount, paid, changeCount }) {
    if (!billingService.hasWeekEnded(weekStart)) {
        return 'A payout can be triggered once the week has ended';
    }

    if (reviewCount > 0) {
        return `Cannot trigger the payout: ${reviewCount} rider(s) require review`;
    }

    if (paid && changeCount === 0) {
        return 'Nothing has changed since the last payout';
    }

    if (changeCount === 0) {
        return 'No rider has anything to deduct this week';
    }

    return null;
}

// The changes a payout run would write for the week, against the current payout.
async function findPayoutChanges({ weekStart }) {
    const [summary, items] = await Promise.all([
        billingService.calculateWeeklyBills({ weekStart }),
        payoutRepository.findItems(pool, { weekStart })
    ]);

    const changes = diffPayout(
        summary.riders,
        new Map(items.map(item => [item.rider_id, toPaidAmounts(item)]))
    );

    return { summary, items, changes };
}

// A week's payout: status, what the next run would change, and every run so far.
async function getWeekPayout({ weekStart }) {
    const [{ summary, items, changes }, runRows] = await Promise.all([
        findPayoutChanges({ weekStart }),
        payoutRepository.findRuns(pool, { weekStart })
    ]);

    const runs = runRows.map(toRun);
    const paid = runs.length > 0;

    const riderRows = await billingRepository.findRidersByIds(pool, {
        riderIds: changes.map(change => change.riderId)
    });
    const nameById = new Map(riderRows.map(row => [row.rider_id, row.name]));

    return {
        weekStart,
        weekEnded: billingService.hasWeekEnded(weekStart),
        paid,
        runCount: runs.length,
        firstPaidAt: runs[0]?.triggeredAt ?? null,
        lastRunAt: runs.at(-1)?.triggeredAt ?? null,
        deductedRiderCount: items.length,
        deductedTotalAmount: runs.at(-1)?.totalAmount ?? null,
        liveTotalAmount: summary.totalAmount,
        reviewCount: summary.reviewCount,
        changeCount: changes.length,
        changeDifference: roundAmount(changes.reduce((sum, change) => sum + change.difference, 0)),
        blocker: getPayoutBlocker({
            weekStart,
            reviewCount: summary.reviewCount,
            paid,
            changeCount: changes.length
        }),
        changes: changes.map(change => ({ ...change, riderName: nameById.get(change.riderId) ?? null })),
        runs: [...runs].reverse()
    };
}

// Trigger the week's payout. The first run pays every rider; a later run only
// updates riders whose amounts changed. Riders that match keep their payout.
async function triggerPayout({ weekStart }) {
    if (!billingService.hasWeekEnded(weekStart)) {
        throw new AppError('A payout can be triggered once the week has ended', 409);
    }

    const summary = await billingService.calculateWeeklyBills({ weekStart });

    if (summary.reviewCount > 0) {
        throw new AppError(
            `Cannot trigger the payout: ${summary.reviewCount} rider(s) require review`,
            409
        );
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Read the current payout under the lock, so two runs cannot both apply the same change.
        await payoutRepository.lockWeek(client, { weekStart });

        const [runs, items] = await Promise.all([
            payoutRepository.findRuns(client, { weekStart }),
            payoutRepository.findItems(client, { weekStart })
        ]);

        const paidByRider = new Map(items.map(item => [item.rider_id, toPaidAmounts(item)]));
        const changes = diffPayout(summary.riders, paidByRider);

        const blocker = getPayoutBlocker({
            weekStart,
            reviewCount: 0,
            paid: runs.length > 0,
            changeCount: changes.length
        });

        if (blocker) {
            throw new AppError(blocker, 409);
        }

        for (const change of changes) {
            paidByRider.set(change.riderId, change.current);
        }

        const totalAmount = roundAmount(
            [...paidByRider.values()].reduce((sum, amounts) => sum + amounts.totalAmount, 0)
        );

        const run = await payoutRepository.insertRun(client, {
            weekStart,
            runNumber: runs.length + 1,
            riderCount: paidByRider.size,
            updatedCount: changes.length,
            totalAmount
        });

        for (const change of changes) {
            await payoutRepository.upsertItem(client, {
                weekStart,
                riderId: change.riderId,
                amounts: change.current,
                runId: run.run_id
            });
        }

        await client.query('COMMIT');

        return {
            run: toRun(run),
            previousTotalAmount: runs.at(-1)?.total_amount ?? null,
            updated: changes.map(change => ({
                riderId: change.riderId,
                previousAmount: change.paid?.totalAmount ?? null,
                totalAmount: change.current.totalAmount,
                difference: change.difference
            }))
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// The latest payout runs across all weeks.
async function getRecentPayouts({ limit = 10 }) {
    const rows = await payoutRepository.findRecentRuns(pool, { limit });
    return rows.map(toRun);
}

module.exports = {
    getWeekPayout,
    triggerPayout,
    getRecentPayouts
};
