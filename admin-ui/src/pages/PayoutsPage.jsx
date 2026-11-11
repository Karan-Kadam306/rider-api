import { useState } from 'react';
import { Link } from 'react-router-dom';

import { getRecentPayouts, getWeekPayout, triggerPayout } from '../api/payoutsApi';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useWeek } from '../context/WeekContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import ConfirmDialog from '../components/feedback/ConfirmDialog';
import CurrencyText from '../components/ui/CurrencyText';
import Icon from '../components/ui/Icon';
import StatCard from '../components/ui/StatCard';
import StatusBadge from '../components/ui/StatusBadge';
import PayoutChangesTable from '../features/payouts/PayoutChangesTable';
import { getPayoutStatus } from '../features/payouts/getPayoutStatus';
import { formatINR, formatNumber } from '../utils/formatCurrency';
import { formatDateTime, formatWeekRange } from '../utils/week';

// Trigger the selected week's payout, see what a re-run would change, and the run history.
export default function PayoutsPage() {
    const { weekStart, setWeekStart, refreshKey, refresh } = useWeek();
    const showToast = useToast();
    // Only admins see the trigger button; the API enforces the same rule.
    const { isAdmin } = useAuth();
    const [confirming, setConfirming] = useState(false);
    const [running, setRunning] = useState(false);

    const week = useApi(options => getWeekPayout(weekStart, options), [weekStart, refreshKey]);
    // Covers all weeks, so it does not depend on weekStart.
    const recent = useApi(options => getRecentPayouts({ limit: 8 }, options), [refreshKey]);

    const payout = week.data;
    // changeCount is what the next run would apply, which is the pendingCount the badge expects.
    const status = payout && getPayoutStatus({ paid: payout.paid, pendingCount: payout.changeCount });

    async function handleTrigger() {
        setRunning(true);

        try {
            const result = await triggerPayout(weekStart);
            // Run 1 deducts everyone; later runs only touch riders whose amounts changed.
            showToast({
                message: result.run.runNumber === 1
                    ? `Payout triggered for ${formatWeekRange(weekStart)}: ${formatINR(result.run.totalAmount)} deducted`
                    : `Payout re-triggered: ${result.run.updatedCount} rider${result.run.updatedCount === 1 ? '' : 's'} updated`
            });
            setConfirming(false);
            refresh();
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        } finally {
            setRunning(false);
        }
    }

    return (
        <>
            <PageHeader
                title="Payouts"
                subtitle={`Payout for ${formatWeekRange(weekStart)}`}
                actions={isAdmin && payout && (
                    <button
                        type="button"
                        className="button"
                        disabled={Boolean(payout.blocker)}
                        title={payout.blocker ?? undefined}
                        onClick={() => setConfirming(true)}
                    >
                        <Icon name="wallet" size={16} />
                        {payout.paid ? 'Re-trigger payout' : 'Trigger payout'}
                    </button>
                )}
            />

            {week.loading && <LoadingSkeleton variant="table" rows={6} />}

            {week.error && <ErrorState title="Could not load the payout" error={week.error} onRetry={week.retry} />}

            {payout && (
                <>
                    <div className="card-grid">
                        <StatCard
                            label="Payout status"
                            value={payout.paid ? `Run ${payout.runCount}` : '—'}
                            badge={<StatusBadge status={status} />}
                            subText={payout.paid && !payout.pendingEarningsCount
                                ? `First run ${formatDateTime(payout.firstPaidAt)}`
                                : payout.blocker ?? 'Ready to trigger'}
                            to={payout.pendingEarningsCount ? '/pending-earnings' : undefined}
                            linkLabel="Pending Review"
                        />
                        <StatCard
                            label="Total deducted"
                            value={payout.paid ? <CurrencyText value={payout.deductedTotalAmount} /> : '—'}
                            subText={payout.paid
                                ? `${formatNumber(payout.deductedRiderCount)} riders · last run ${formatDateTime(payout.lastRunAt)}`
                                : 'Filled in by the first payout'}
                        />
                        <StatCard
                            label={payout.paid ? 'Changes since payout' : 'To deduct'}
                            value={payout.paid
                                ? <CurrencyText value={payout.changeDifference} showSign />
                                : <CurrencyText value={payout.changeDifference} />}
                            subText={`${payout.changeCount} rider${payout.changeCount === 1 ? '' : 's'}`}
                        />
                        <StatCard
                            label="Live total"
                            value={<CurrencyText value={payout.liveTotalAmount} />}
                            subText={payout.reviewCount ? `${payout.reviewCount} rider(s) need review` : 'Current bills this week'}
                            to="/billing"
                            linkLabel="Billing"
                        >
                            <p className="stat-card__sub">
                                Net payout <CurrencyText value={payout.liveNetPayout} /> after{' '}
                                <CurrencyText value={payout.liveTotalEarnings} /> earnings
                            </p>
                        </StatCard>
                    </div>

                    <section className="card card--flush">
                        <div className="panel__header payout-section__header">
                            <h3 className="panel__title">
                                {payout.paid ? 'Changes the next run will apply' : 'Deductions in the first payout'}
                            </h3>
                            {payout.paid && (
                                <span className="cell-sub">Riders whose amounts still match keep their current deduction.</span>
                            )}
                        </div>
                        {payout.changes.length ? (
                            <PayoutChangesTable changes={payout.changes} />
                        ) : (
                            <div className="card__empty">
                                <EmptyState
                                    message={payout.paid
                                        ? 'Nothing has changed since the last payout.'
                                        : 'No rider has earnings or deductions this week.'}
                                />
                            </div>
                        )}
                    </section>

                    <div className="widget-grid">
                        <section className="card panel">
                            <div className="panel__header">
                                <h3 className="panel__title">Runs this week</h3>
                            </div>
                            {payout.runs.length ? (
                                <div className="table-wrap">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Run</th>
                                                <th>Triggered</th>
                                                <th className="num">Updated</th>
                                                <th className="num">Week total</th>
                                                <th className="num">Net payout</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {payout.runs.map(run => (
                                                <tr key={run.runId}>
                                                    <td>#{run.runNumber}</td>
                                                    <td className="nowrap">{formatDateTime(run.triggeredAt)}</td>
                                                    <td className="num">{run.updatedCount} of {run.riderCount}</td>
                                                    <td className="num"><CurrencyText value={run.totalAmount} /></td>
                                                    {/* Runs from before partner earnings have no net. */}
                                                    <td className="num">
                                                        {run.totalNetPayout === null ? <span className="muted">—</span> : <CurrencyText value={run.totalNetPayout} />}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <EmptyState message="No payout has been triggered for this week yet." />
                            )}
                        </section>

                        <section className="card panel">
                            <div className="panel__header">
                                <h3 className="panel__title">Recent payouts</h3>
                            </div>
                            {recent.error && <ErrorState title="Could not load recent payouts" error={recent.error} onRetry={recent.retry} />}
                            {recent.data && (recent.data.length ? (
                                <div className="table-wrap">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Week</th>
                                                <th>Run</th>
                                                <th className="num">Week total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recent.data.map(run => (
                                                <tr key={run.runId}>
                                                    <td>
                                                        <button type="button" className="button button--link payout-week-link" onClick={() => setWeekStart(run.weekStart)}>
                                                            {formatWeekRange(run.weekStart)}
                                                        </button>
                                                        <div className="cell-sub">{formatDateTime(run.triggeredAt)}</div>
                                                    </td>
                                                    <td>#{run.runNumber}</td>
                                                    <td className="num"><CurrencyText value={run.totalAmount} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <EmptyState message="No payouts yet." />
                            ))}
                        </section>
                    </div>

                    <p className="muted">
                        Deductions per rider are also shown on <Link to="/billing">Billing</Link>.
                    </p>
                </>
            )}

            <ConfirmDialog
                open={confirming}
                title={payout?.paid ? 'Re-trigger this payout?' : 'Trigger this payout?'}
                message={
                    payout?.paid ? (
                        <p>
                            {payout.changeCount} rider{payout.changeCount === 1 ? '' : 's'} will be updated
                            (<CurrencyText value={payout.changeDifference} showSign />). Every other rider keeps their
                            current deduction.
                        </p>
                    ) : (
                        <p>
                            This applies the deductions of {payout?.changeCount} rider{payout?.changeCount === 1 ? '' : 's'} for{' '}
                            {formatWeekRange(weekStart)} (<CurrencyText value={payout?.changeDifference} />).
                        </p>
                    )
                }
                confirmLabel={payout?.paid ? 'Re-trigger payout' : 'Trigger payout'}
                busy={running}
                onConfirm={handleTrigger}
                onCancel={() => setConfirming(false)}
            />
        </>
    );
}
