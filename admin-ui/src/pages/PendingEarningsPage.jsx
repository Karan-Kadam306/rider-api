import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { dismissPendingEarnings, getPartners, getPendingEarnings, resolvePendingEarnings } from '../api/partnersApi';
import { useApi } from '../hooks/useApi';
import { useWeek } from '../context/WeekContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import Icon from '../components/ui/Icon';
import Pagination from '../components/ui/Pagination';
import PendingEarningsTable from '../features/pendingEarnings/PendingEarningsTable';
import ResolveEarningsDialog from '../features/pendingEarnings/ResolveEarningsDialog';
import DismissEarningsDialog from '../features/pendingEarnings/DismissEarningsDialog';

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;

function entriesText(count) {
    return `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

// Earnings whose partner ID is not mapped to any rider yet, one row per partner + ID.
// Partner, search and page live in the URL so a filtered view can be linked or reloaded.
export default function PendingEarningsPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const partnerId = searchParams.get('partnerId') ?? '';
    const search = searchParams.get('search') ?? '';
    const page = Math.max(Number(searchParams.get('page')) || 1, 1);

    const { refreshKey } = useWeek();
    const showToast = useToast();

    const [searchInput, setSearchInput] = useState(search);
    const [reloadKey, setReloadKey] = useState(0);
    const [resolving, setResolving] = useState(null);
    const [dismissing, setDismissing] = useState(null);

    const partners = useApi(options => getPartners(options), [refreshKey]);
    const list = useApi(
        options => getPendingEarnings({ partnerId: partnerId || undefined, search, page, limit: PAGE_SIZE }, options),
        [partnerId, search, page, refreshKey, reloadKey]
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
        if (searchInput.trim() === search) {
            return undefined;
        }

        const timer = setTimeout(() => updateParams({ search: searchInput.trim(), page: undefined }), SEARCH_DELAY_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchInput, search]);

    // Resolving the last row of the last page leaves it empty; step back to a real one.
    const totalPages = list.data?.pagination.totalPages ?? 0;
    useEffect(() => {
        if (list.data && page > 1 && page > totalPages) {
            updateParams({ page: totalPages > 1 ? totalPages : undefined });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [list.data, page, totalPages]);

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

    async function handleDismiss(reason) {
        const result = await dismissPendingEarnings({
            partnerId: dismissing.partnerId,
            partnerRiderId: dismissing.partnerRiderId,
            reason
        });

        showToast({ message: `${result.partnerRiderId}: ${entriesText(result.dismissedEarnings)} dismissed` });
        setDismissing(null);
        setReloadKey(key => key + 1);
    }

    const error = list.error ?? partners.error;
    const retry = () => {
        list.retry();
        partners.retry();
    };

    return (
        <>
            <PageHeader
                breadcrumbs={[{ label: 'Riders', to: '/riders' }, { label: 'Pending Earnings' }]}
                title="Pending Earnings"
                subtitle="Earnings from partner sheets whose ID is not mapped to a rider. Resolve each ID once and all its entries move to the rider."
            />

            <div className="km-filters">
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

            {(list.loading || partners.loading) && !error && <LoadingSkeleton variant="table" rows={8} />}

            {error && <ErrorState title="Could not load pending earnings" error={error} onRetry={retry} />}

            {list.data && partners.data && (
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
                <DismissEarningsDialog group={dismissing} onSubmit={handleDismiss} onClose={() => setDismissing(null)} />
            )}
        </>
    );
}
