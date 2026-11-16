import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import {
    dismissEarningsRowError,
    dismissPendingEarnings,
    getEarningsRowErrors,
    getPartners,
    getPendingEarnings,
    resolvePendingEarnings
} from '../api/partnersApi';
import { useApi } from '../hooks/useApi';
import { useWeek } from '../context/WeekContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import CurrencyText from '../components/ui/CurrencyText';
import Icon from '../components/ui/Icon';
import Pagination from '../components/ui/Pagination';
import StatusTabs from '../components/ui/StatusTabs';
import PendingEarningsTable from '../features/pendingEarnings/PendingEarningsTable';
import RejectedRowsTable from '../features/pendingEarnings/RejectedRowsTable';
import ResolveEarningsDialog from '../features/pendingEarnings/ResolveEarningsDialog';
import DismissEarningsDialog from '../features/pendingEarnings/DismissEarningsDialog';

const TABS = [
    { value: 'unknown', label: 'Unknown IDs', icon: 'userX' },
    { value: 'rejected', label: 'Rejected rows', icon: 'file' }
];
const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;

function entriesText(count) {
    return `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

// Two queues that block payouts: earnings whose partner ID is not mapped to any rider yet (one row per
// partner + ID), and sheet rows that failed to import. Tab, partner, search and page live in the URL.
export default function PendingEarningsPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = searchParams.get('tab') === 'rejected' ? 'rejected' : 'unknown';
    const partnerId = searchParams.get('partnerId') ?? '';
    const search = searchParams.get('search') ?? '';
    const page = Math.max(Number(searchParams.get('page')) || 1, 1);

    const { refreshKey } = useWeek();
    const showToast = useToast();

    const [searchInput, setSearchInput] = useState(search);
    const [reloadKey, setReloadKey] = useState(0);
    const [resolving, setResolving] = useState(null);
    const [dismissing, setDismissing] = useState(null);
    const [dismissingRow, setDismissingRow] = useState(null);

    // Both lists load so each tab shows its count; only the open tab uses the page.
    const partners = useApi(options => getPartners(options), [refreshKey]);
    const list = useApi(
        options => getPendingEarnings(
            { partnerId: partnerId || undefined, search, page: tab === 'unknown' ? page : 1, limit: PAGE_SIZE },
            options
        ),
        [tab, partnerId, search, page, refreshKey, reloadKey]
    );
    const rejected = useApi(
        options => getEarningsRowErrors(
            { partnerId: partnerId || undefined, page: tab === 'rejected' ? page : 1, limit: PAGE_SIZE },
            options
        ),
        [tab, partnerId, page, refreshKey, reloadKey]
    );
    const current = tab === 'rejected' ? rejected : list;

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
        if (searchInput.trim() === search) {
            return undefined;
        }

        const timer = setTimeout(() => updateParams({ search: searchInput.trim(), page: undefined }), SEARCH_DELAY_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchInput, search]);

    // Resolving the last row of the last page leaves it empty; step back to a real one.
    const totalPages = current.data?.pagination.totalPages ?? 0;
    useEffect(() => {
        if (current.data && page > 1 && page > totalPages) {
            updateParams({ page: totalPages > 1 ? totalPages : undefined });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current.data, page, totalPages]);

    // Errors are not caught here: they reject back to the dialog, which shows them.
    async function handleResolve(rider) {
        const result = await resolvePendingEarnings({
            partnerId: resolving.partnerId,
            partnerRiderId: resolving.partnerRiderId,
            riderId: rider.rider_id
        });

        showToast({ message: `${result.partnerRiderId} mapped to ${result.riderName}; ${entriesText(result.matchedEarnings)} matched` });
        setResolving(null);
        setReloadKey(key => key + 1);
    }

    async function handleDismiss(reason, { alwaysIgnore }) {
        const result = await dismissPendingEarnings({
            partnerId: dismissing.partnerId,
            partnerRiderId: dismissing.partnerRiderId,
            reason,
            alwaysIgnore
        });

        const ignored = result.alwaysIgnore ? '; later rows will be ignored' : '';
        showToast({ message: `${result.partnerRiderId}: ${entriesText(result.dismissedEarnings)} dismissed${ignored}` });
        setDismissing(null);
        setReloadKey(key => key + 1);
    }

    async function handleDismissRow(note) {
        const result = await dismissEarningsRowError({ errorId: dismissingRow.errorId, note });

        showToast({ message: `Line ${result.rowNumber} dismissed` });
        setDismissingRow(null);
        setReloadKey(key => key + 1);
    }

    const error = current.error ?? partners.error;
    const retry = () => {
        current.retry();
        partners.retry();
    };

    return (
        <>
            <PageHeader
                breadcrumbs={[{ label: 'Riders', to: '/riders' }, { label: 'Pending Earnings' }]}
                title="Pending Earnings"
                subtitle="Earnings that hold up payouts: partner IDs not mapped to a rider, and sheet rows that failed to import. Re-uploading a corrected row clears it."
            />

            <StatusTabs
                label="Pending earnings"
                tabs={[
                    { ...TABS[0], count: list.data?.pagination.totalRecords },
                    { ...TABS[1], count: rejected.data?.pagination.totalRecords }
                ]}
                value={tab}
                onChange={next => updateParams({ tab: next === 'unknown' ? undefined : next, page: undefined })}
            />

            <div className="km-filters">
                {tab === 'unknown' && (
                    <div className="search-box km-filters__search">
                        <Icon name="search" />
                        <input
                            type="search"
                            value={searchInput}
                            onChange={event => setSearchInput(event.target.value)}
                            placeholder="Search by partner ID or name in the sheet…"
                            aria-label="Search pending earnings"
                        />
                    </div>
                )}
                <select
                    className="select"
                    aria-label="Filter by partner"
                    value={partnerId}
                    onChange={event => updateParams({ partnerId: event.target.value, page: undefined })}
                >
                    <option value="">All partners</option>
                    {(partners.data ?? []).map(partner => (
                        <option key={partner.partnerId} value={partner.partnerId}>{partner.name}</option>
                    ))}
                </select>
            </div>

            {(current.loading || partners.loading) && !error && <LoadingSkeleton variant="table" rows={8} />}

            {error && <ErrorState title="Could not load pending earnings" error={error} onRetry={retry} />}

            {tab === 'rejected' && rejected.data && partners.data && (
                <section className="card card--flush">
                    {rejected.data.rowErrors.length ? (
                        <>
                            <RejectedRowsTable rowErrors={rejected.data.rowErrors} onDismiss={setDismissingRow} />
                            <Pagination
                                {...rejected.data.pagination}
                                onPageChange={next => updateParams({ page: next > 1 ? next : undefined })}
                            />
                        </>
                    ) : (
                        <div className="card__empty">
                            <EmptyState message="No rejected rows. Every row of the imported sheets was saved." />
                        </div>
                    )}
                </section>
            )}

            {tab === 'unknown' && list.data && partners.data && (
                <section className="card card--flush">
                    {list.data.groups.length ? (
                        <>
                            <PendingEarningsTable
                                groups={list.data.groups}
                                onResolve={setResolving}
                                onDismiss={setDismissing}
                            />
                            <Pagination
                                {...list.data.pagination}
                                onPageChange={next => updateParams({ page: next > 1 ? next : undefined })}
                            />
                        </>
                    ) : (
                        <div className="card__empty">
                            {search || partnerId ? (
                                <EmptyState message="No pending earnings match these filters." />
                            ) : (
                                <EmptyState message="No pending earnings. Every partner ID in the imported sheets is mapped." />
                            )}
                            <Link to="/partner-mappings">Go to Partner Mappings →</Link>
                        </div>
                    )}
                </section>
            )}

            {resolving && (
                <ResolveEarningsDialog group={resolving} onSubmit={handleResolve} onClose={() => setResolving(null)} />
            )}

            {dismissing && (
                <DismissEarningsDialog
                    title={`Dismiss ${dismissing.partnerName} earnings`}
                    details={(
                        <>
                            <span className="mono">{dismissing.partnerRiderId}</span> · {entriesText(dismissing.entries)} · <CurrencyText value={dismissing.totalAmount} />
                        </>
                    )}
                    hint="Dismissed entries are not paid to anyone. If the partner later sends a different amount, they come back for review, unless the ID is always ignored. Mapping the ID to a rider later still matches its new rows."
                    placeholder="e.g. Rider works for another fleet"
                    alwaysIgnoreLabel={`Always ignore ${dismissing.partnerRiderId} in future ${dismissing.partnerName} sheets`}
                    onSubmit={handleDismiss}
                    onClose={() => setDismissing(null)}
                />
            )}

            {dismissingRow && (
                <DismissEarningsDialog
                    title={`Dismiss a rejected ${dismissingRow.partnerName} row`}
                    details={`${dismissingRow.fileName}, line ${dismissingRow.rowNumber}: ${dismissingRow.errorMessage}`}
                    hint="Dismiss only when no corrected row will come. The row is not paid; uploading the corrected row instead clears it on its own."
                    placeholder="e.g. Blank line at the end of the sheet"
                    onSubmit={handleDismissRow}
                    onClose={() => setDismissingRow(null)}
                />
            )}
        </>
    );
}
