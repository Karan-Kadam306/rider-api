const { pool, inTransaction } = require('../db');
const AppError = require('../errors/AppError');
const billingRepository = require('../repositories/billingRepository');
const payoutRepository = require('../repositories/payoutRepository');
const billingService = require('./billingService');
const { diffPayout, paidNetPayout, toPaidAmounts } = require('../utils/diffPayout');

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
        totalEarnings: row.total_earnings,
        totalNetPayout: row.total_net_payout,
        triggeredAt: row.triggered_at
    };
}

function sumField(amounts, field) {
    return roundAmount(amounts.reduce((sum, item) => sum + (item[field] ?? 0), 0));
}

// Why a payout cannot run now, or null. Mirrored by the admin UI to explain a disabled button.
function getPayoutBlocker({ weekStart, reviewCount, pendingEarningsCount, partnersWithoutEarnings, paid, changeCount }) {
    if (!billingService.hasWeekEnded(weekStart)) {
        return 'A payout can be triggered once the week has ended';
    }

    if (reviewCount > 0) {
        return `Cannot trigger the payout: ${reviewCount} rider(s) require review`;
    }

    if (pendingEarningsCount > 0) {
        return `Cannot trigger the payout: ${pendingEarningsCount} partner ID(s) have pending earnings this week`;
    }

    if (partnersWithoutEarnings.length > 0) {
        return `Cannot trigger the payout: no earnings imported this week from ${partnersWithoutEarnings.join(', ')}`;
    }

    if (paid && changeCount === 0) {
        return 'Nothing has changed since the last payout';
    }

    if (changeCount === 0) {
        return 'No rider has earnings or deductions this week';
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
        paidNetPayout: runs.at(-1)?.totalNetPayout ?? null,
        liveTotalAmount: summary.totalAmount,
        liveTotalEarnings: summary.totalEarnings,
        liveNetPayout: summary.totalNetPayout,
        reviewCount: summary.reviewCount,
        pendingEarningsCount: summary.pendingEarningsCount,
        partnersWithoutEarnings: summary.partnersWithoutEarnings,
        changeCount: changes.length,
        changeDifference: sumField(changes, 'difference'),
        changeNetDifference: sumField(changes, 'netDifference'),
        blocker: getPayoutBlocker({
            weekStart,
            reviewCount: summary.reviewCount,
            pendingEarningsCount: summary.pendingEarningsCount,
            partnersWithoutEarnings: summary.partnersWithoutEarnings,
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
    const summary = await billingService.calculateWeeklyBills({ weekStart });

    return inTransaction(async client => {
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
            reviewCount: summary.reviewCount,
            pendingEarningsCount: summary.pendingEarningsCount,
            partnersWithoutEarnings: summary.partnersWithoutEarnings,
            paid: runs.length > 0,
            changeCount: changes.length
        });

        if (blocker) {
            throw new AppError(blocker, 409);
        }

        // Riders that did not change keep their old amounts, so the run totals still cover everyone paid.
        for (const change of changes) {
            paidByRider.set(change.riderId, change.current);
        }

        const paidAmounts = [...paidByRider.values()];

        const run = await payoutRepository.insertRun(client, {
            weekStart,
            runNumber: runs.length + 1,
            riderCount: paidByRider.size,
            updatedCount: changes.length,
            totalAmount: sumField(paidAmounts, 'totalAmount'),
            totalEarnings: sumField(paidAmounts, 'earnings'),
            totalNetPayout: roundAmount(paidAmounts.reduce((sum, amounts) => sum + paidNetPayout(amounts), 0))
        });

        for (const change of changes) {
            await payoutRepository.upsertItem(client, {
                weekStart,
                riderId: change.riderId,
                amounts: change.current,
                runId: run.run_id
            });
        }

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
    });
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
