import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { getDailyKmRecords, resolveDailyKmRecord, validateDailyKm } from '../api/dailyKmApi';
import { useApi } from '../hooks/useApi';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useWeek } from '../context/WeekContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import ConfirmDialog from '../components/feedback/ConfirmDialog';
import Icon from '../components/ui/Icon';
import Pagination from '../components/ui/Pagination';
import StatusTabs from '../components/ui/StatusTabs';
import DailyKmTable from '../features/dailyKm/DailyKmTable';
import ResolveRecordDialog from '../features/dailyKm/ResolveRecordDialog';
import { formatDate } from '../utils/formatDate';
import { addDays } from '../utils/week';

// Pending: matched to exactly one rider, waiting for validation. Validated: counted in billing.
// Needs Review: the VIN matches no bike, or not exactly one rider held the bike that day.
// "All" is a UI-only tab: the API returns every status when no status is sent.
const KM_TABS = [
    { value: 'All', icon: 'gauge' },
    { value: 'Pending', icon: 'clock' },
    { value: 'Needs Review', icon: 'userX' },
    { value: 'Validated', icon: 'circleCheck' }
];
const PAGE_SIZE = 20;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Date range, status, search and page live in the URL so a view can be linked
// (the Dashboard and Document Hub link here). Without dates, the selected week is shown.
export default function DailyKmPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { weekStart, refreshKey } = useWeek();
    const showToast = useToast();

    const requestedFrom = searchParams.get('fromDate');
    const requestedTo = searchParams.get('toDate');
    const hasCustomRange = DATE_PATTERN.test(requestedFrom ?? '') && DATE_PATTERN.test(requestedTo ?? '')
        && requestedFrom <= requestedTo;
    const fromDate = hasCustomRange ? requestedFrom : weekStart;
    const toDate = hasCustomRange ? requestedTo : addDays(weekStart, 6);

    const requestedStatus = searchParams.get('status');
    const status = KM_TABS.some(tab => tab.value === requestedStatus) ? requestedStatus : 'All';
    const search = searchParams.get('search') ?? '';
    const page = Math.max(Number(searchParams.get('page')) || 1, 1);

    const [searchInput, setSearchInput] = useState(search);
    const debouncedSearch = useDebouncedValue(searchInput.trim());
    // Bumped after a change on this page to refetch; refreshKey does the same for the top bar's Refresh.
    const [reloadKey, setReloadKey] = useState(0);
    const [resolving, setResolving] = useState(null);
    const [confirmingValidate, setConfirmingValidate] = useState(false);
    const [validateBusy, setValidateBusy] = useState(false);

    const list = useApi(
        options => getDailyKmRecords({
            fromDate,
            toDate,
            status: status === 'All' ? undefined : status,
            search: search || undefined,
            page,
            limit: PAGE_SIZE
        }, options),
        [fromDate, toDate, status, search, page, refreshKey, reloadKey]
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

    // Keep the range valid while typing: moving one end past the other moves both.
    function changeRange(edge, value) {
        if (!DATE_PATTERN.test(value)) {
            return;
        }

        const next = edge === 'from'
            ? { fromDate: value, toDate: value > toDate ? value : toDate }
            : { fromDate: value < fromDate ? value : fromDate, toDate: value };

        updateParams({ ...next, page: undefined });
    }

    // Push the typed search into the URL once the user pauses.
    useEffect(() => {
        if (debouncedSearch !== search) {
            updateParams({ search: debouncedSearch, page: undefined });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearch]);

    // After a record leaves this tab (resolved/validated), the last page can end up empty; step back.
    const totalPages = list.data?.pagination.totalPages ?? 0;
    useEffect(() => {
        if (list.data && page > 1 && page > totalPages) {
            updateParams({ page: totalPages > 1 ? totalPages : undefined });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [list.data, page, totalPages]);

    const reload = () => setReloadKey(key => key + 1);

    const statusCounts = list.data?.statusCounts;
    // With a search, counts only cover matching rows, but Validate covers the whole range.
    const pendingCount = search ? null : statusCounts?.Pending;

    async function handleValidate() {
        setValidateBusy(true);

        try {
            const result = await validateDailyKm({ fromDate, toDate });
            showToast({
                message: result.validated
                    ? `${result.validated} record${result.validated === 1 ? '' : 's'} validated`
                    : 'No Pending records to validate'
            });
            setConfirmingValidate(false);
            reload();
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        } finally {
            setValidateBusy(false);
        }
    }

    // Errors are not caught here: they reject back to the dialog, which shows them.
    async function handleResolve(values) {
        await resolveDailyKmRecord(resolving.km_record_id, values);
        showToast({ message: `${resolving.reported_vin} on ${formatDate(resolving.usage_date)} resolved and validated` });
        setResolving(null);
        reload();
    }

    return (
        <>
            <PageHeader
                breadcrumbs={[{ label: 'Daily KM', to: '/daily-km' }, { label: 'Records' }]}
                title="Daily KM"
                subtitle="Review uploaded KM, resolve unmatched records and validate them for billing."
                actions={
                    <>
                        <Link className="button button--secondary" to="/documents">
                            <Icon name="upload" size={16} />
                            Upload in Document Hub
                        </Link>
                        <button
                            type="button"
                            className="button"
                            disabled={pendingCount === 0}
                            onClick={() => setConfirmingValidate(true)}
                        >
                            <Icon name="circleCheck" size={16} />
                            {pendingCount ? `Validate ${pendingCount} pending` : 'Validate pending'}
                        </button>
                    </>
                }
            />

            <div className="km-filters">
                <label className="field km-filters__date">
                    <span className="field__label">From</span>
                    <input type="date" value={fromDate} onChange={event => changeRange('from', event.target.value)} />
                </label>
                <label className="field km-filters__date">
                    <span className="field__label">To</span>
                    <input type="date" value={toDate} onChange={event => changeRange('to', event.target.value)} />
                </label>
                {hasCustomRange && (
                    <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => updateParams({ fromDate: undefined, toDate: undefined, page: undefined })}
                    >
                        Back to selected week
                    </button>
                )}
                <div className="search-box km-filters__search">
                    <Icon name="search" />
                    <input
                        type="search"
                        value={searchInput}
                        onChange={event => setSearchInput(event.target.value)}
                        placeholder="Search by VIN, rider ID or name…"
                        aria-label="Search Daily KM records"
                    />
                </div>
            </div>

            <StatusTabs
                label="Daily KM status"
                tabs={KM_TABS.map(tab => ({
                    value: tab.value,
                    label: tab.value,
                    icon: tab.icon,
                    // statusCounts has no total, so All adds up the others.
                    count: statusCounts && (tab.value === 'All'
                        ? Object.values(statusCounts).reduce((sum, count) => sum + count, 0)
                        : statusCounts[tab.value])
                }))}
                value={status}
                onChange={next => updateParams({ status: next === 'All' ? undefined : next, page: undefined })}
            />

            {list.loading && <LoadingSkeleton variant="table" rows={8} />}

            {list.error && <ErrorState title="Could not load Daily KM records" error={list.error} onRetry={list.retry} />}

            {list.data && (
                <section className="card card--flush">
                    {list.data.records.length ? (
                        <>
                            <DailyKmTable records={list.data.records} onResolve={setResolving} />
                            <Pagination
                                {...list.data.pagination}
                                onPageChange={next => updateParams({ page: next > 1 ? next : undefined })}
                            />
                        </>
                    ) : (
                        <div className="card__empty">
                            <EmptyState
                                message={search
                                    ? `No records match “${search}” between ${formatDate(fromDate)} and ${formatDate(toDate)}.`
                                    : `No ${status === 'All' ? '' : `${status} `}records between ${formatDate(fromDate)} and ${formatDate(toDate)}.`}
                            />
                        </div>
                    )}
                </section>
            )}

            {resolving && (
                <ResolveRecordDialog record={resolving} onSubmit={handleResolve} onClose={() => setResolving(null)} />
            )}

            <ConfirmDialog
                open={confirmingValidate}
                title="Validate pending records?"
                message={
                    <p>
                        Every matched <strong>Pending</strong> record from <strong>{formatDate(fromDate)}</strong> to{' '}
                        <strong>{formatDate(toDate)}</strong> will be marked Validated and counted in billing.
                        Needs Review records are not changed.
                    </p>
                }
                confirmLabel="Validate"
                busy={validateBusy}
                onConfirm={handleValidate}
                onCancel={() => setConfirmingValidate(false)}
            />
        </>
    );
}
