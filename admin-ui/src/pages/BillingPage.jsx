import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { closeWeek, exportBills, getBills } from '../api/billingApi';
import { useApi } from '../hooks/useApi';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
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
import Pagination from '../components/ui/Pagination';
import StatCard from '../components/ui/StatCard';
import StatusBadge from '../components/ui/StatusBadge';
import StatusTabs from '../components/ui/StatusTabs';
import BillsTable from '../features/billing/BillsTable';
import RiderBillPanel from '../features/billing/RiderBillPanel';
import { getCloseBlocker } from '../features/billing/getCloseBlocker';
import { getPayoutStatus } from '../features/payouts/getPayoutStatus';
import { formatINR, formatNumber, toNumber } from '../utils/formatCurrency';
import { formatDateTime, formatWeekRange } from '../utils/week';

// "changed" only means something once the week is closed, and "payoutPending" after the first payout,
// so those tabs are hidden before that.
const BILL_VIEWS = [
    { value: 'all', label: 'All riders', icon: 'users' },
    { value: 'needsReview', label: 'Needs review', icon: 'userX' },
    { value: 'changed', label: 'Changed since close', icon: 'refresh' },
    { value: 'payoutPending', label: 'Payout changes', icon: 'wallet' }
];
const PAGE_SIZE = 20;

// View, search and page live in the URL so a filtered list can be linked.
// The ₹59 and ₹1.50 rates in the cards below repeat the backend's constants (utils/calculate*.js);
// change both together.
export default function BillingPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { weekStart, refreshKey, refresh } = useWeek();
    // Only admins see Close week; the API enforces the same rule.
    const { isAdmin } = useAuth();
    const showToast = useToast();

    const requestedView = searchParams.get('view');
    const view = BILL_VIEWS.some(item => item.value === requestedView) ? requestedView : 'all';
    const search = searchParams.get('search') ?? '';
    const page = Math.max(Number(searchParams.get('page')) || 1, 1);

    const [searchInput, setSearchInput] = useState(search);
    const debouncedSearch = useDebouncedValue(searchInput.trim());
    const [viewing, setViewing] = useState(null);
    const [exporting, setExporting] = useState(false);
    const [confirmingClose, setConfirmingClose] = useState(false);
    const [closing, setClosing] = useState(false);

    const list = useApi(
        options => getBills({ weekStart, view, search: search || undefined, page, limit: PAGE_SIZE }, options),
        [weekStart, view, search, page, refreshKey]
    );

    // Merges changes into the URL; an empty value removes the key.
    // replace keeps filter changes out of the back-button history.
    function updateParams(changes) {
        setSearchParams(current => {
            const next = new URLSearchParams(current);

            for (const [key, value] of Object.entries(changes)) {
                if (value === undefined || value === '' || value === null) {
                    next.delete(key);
                } else {
                    next.set(key, value);
                }
            }

            return next;
        }, { replace: true });
    }

    // Push the typed search into the URL once the user pauses.
    useEffect(() => {
        if (debouncedSearch !== search) {
            updateParams({ search: debouncedSearch, page: undefined });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearch]);

    // Switching to a shorter week can leave the page past the end; step back.
    const totalPages = list.data?.pagination.totalPages ?? 0;
    useEffect(() => {
        if (list.data && page > 1 && page > totalPages) {
            updateParams({ page: totalPages > 1 ? totalPages : undefined });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [list.data, page, totalPages]);

    const bills = list.data;
    const closeBlocker = bills && getCloseBlocker({ weekStart, closed: bills.closed, reviewCount: bills.reviewCount });

    async function handleExport() {
        setExporting(true);

        try {
            const fileName = await exportBills({ weekStart, view, search: search || undefined });
            showToast({ message: `${fileName} downloaded` });
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        } finally {
            setExporting(false);
        }
    }

    async function handleClose() {
        setClosing(true);

        try {
            await closeWeek(weekStart);
            showToast({ message: `Week ${formatWeekRange(weekStart)} closed` });
            setConfirmingClose(false);
            refresh();
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        } finally {
            setClosing(false);
        }
    }

    const tabs = BILL_VIEWS.filter(item =>
        (item.value !== 'changed' || bills?.closed) &&
        (item.value !== 'payoutPending' || bills?.payout.paid));

    return (
        <>
            <PageHeader
                title="Billing"
                subtitle={`Every rider's bill for ${formatWeekRange(weekStart)}`}
                actions={
                    <>
                        <button
                            type="button"
                            className="button button--secondary"
                            disabled={!bills?.pagination.totalRecords || exporting}
                            onClick={handleExport}
                        >
                            <Icon name="file" size={16} />
                            {exporting ? 'Exporting…' : 'Export CSV'}
                        </button>
                        {isAdmin && bills && !bills.closed && (
                            <button
                                type="button"
                                className="button button--danger"
                                disabled={Boolean(closeBlocker)}
                                title={closeBlocker ?? undefined}
                                onClick={() => setConfirmingClose(true)}
                            >
                                Close week
                            </button>
                        )}
                    </>
                }
            />

            {list.loading && <LoadingSkeleton variant="table" rows={8} />}

            {list.error && <ErrorState title="Could not load bills" error={list.error} onRetry={list.retry} />}

            {bills && (
                <>
                    <div className="card-grid card-grid--compact">
                        <StatCard
                            label="Riders billed"
                            value={formatNumber(bills.riderCount - bills.reviewCount)}
                            subText={bills.reviewCount ? `${bills.reviewCount} need review` : 'None need review'}
                        />
                        <StatCard
                            label="Rental"
                            value={<CurrencyText value={bills.totalRental} />}
                            subText="₹59 per rental day"
                        />
                        <StatCard
                            label="Energy"
                            value={<CurrencyText value={bills.totalEnergyCharge} />}
                            subText={`${formatNumber(bills.totalKm)} km at ₹1.50`}
                        />
                        <StatCard
                            label="Weekly total"
                            value={<CurrencyText value={bills.totalAmount} />}
                            badge={<StatusBadge status={bills.closed ? 'Closed' : 'Open'} />}
                            subText={bills.closed
                                ? `Billed ${formatINR(bills.billedTotalAmount)} on ${formatDateTime(bills.closedAt)}`
                                : closeBlocker ?? 'Ready to close'}
                        >
                            {bills.closed && toNumber(bills.totalAmount) !== toNumber(bills.billedTotalAmount) && (
                                <p className="stat-card__sub">
                                    Changed since close:{' '}
                                    <CurrencyText value={toNumber(bills.totalAmount) - toNumber(bills.billedTotalAmount)} showSign />
                                </p>
                            )}
                        </StatCard>
                        <StatCard
                            label="Deducted"
                            value={bills.payout.paid ? <CurrencyText value={bills.payout.totalAmount} /> : '—'}
                            badge={<StatusBadge status={getPayoutStatus(bills.payout)} />}
                            subText={!bills.payout.paid
                                ? 'No payout triggered yet'
                                : bills.payout.pendingCount
                                    ? `${bills.payout.pendingCount} rider(s) changed since the payout`
                                    : `Run ${bills.payout.runCount} · ${formatDateTime(bills.payout.lastRunAt)}`}
                            to="/payouts"
                            linkLabel="Payouts"
                        />
                    </div>

                    <div className="km-filters">
                        <div className="search-box km-filters__search">
                            <Icon name="search" />
                            <input
                                type="search"
                                value={searchInput}
                                onChange={event => setSearchInput(event.target.value)}
                                placeholder="Search by rider ID or name…"
                                aria-label="Search bills"
                            />
                        </div>
                    </div>

                    <StatusTabs
                        label="Bill view"
                        tabs={tabs.map(item => ({ ...item, count: bills.viewCounts[item.value] }))}
                        value={view}
                        onChange={next => updateParams({ view: next === 'all' ? undefined : next, page: undefined })}
                    />

                    <section className="card card--flush">
                        {bills.riders.length ? (
                            <>
                                <BillsTable riders={bills.riders} closed={bills.closed} onView={setViewing} />
                                <Pagination
                                    {...bills.pagination}
                                    onPageChange={next => updateParams({ page: next > 1 ? next : undefined })}
                                />
                            </>
                        ) : (
                            <div className="card__empty">
                                <EmptyState
                                    message={search
                                        ? `No riders match “${search}” this week.`
                                        : view === 'all'
                                            ? 'No rider held a bike this week.'
                                            : 'No riders in this view this week.'}
                                />
                            </div>
                        )}
                    </section>
                </>
            )}

            {viewing && <RiderBillPanel rider={viewing} weekStart={weekStart} onClose={() => setViewing(null)} />}

            <ConfirmDialog
                open={confirmingClose}
                title="Close this billing week?"
                message={
                    <p>
                        This saves every rider's bill for {formatWeekRange(weekStart)} as billed
                        (<CurrencyText value={bills?.totalAmount} />). Closing is permanent; later corrections
                        are shown as changes since close.
                    </p>
                }
                confirmLabel="Close week"
                busy={closing}
                onConfirm={handleClose}
                onCancel={() => setConfirmingClose(false)}
            />
        </>
    );
}
