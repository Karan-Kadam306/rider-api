import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { createRider, getRiders, getRiderSummary } from '../api/ridersApi';
import { useApi } from '../hooks/useApi';
import { useWeek } from '../context/WeekContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import Icon from '../components/ui/Icon';
import Pagination from '../components/ui/Pagination';
import StatusTabs from '../components/ui/StatusTabs';
import RidersTable from '../features/riders/RidersTable';
import RiderFormDialog from '../features/riders/RiderFormDialog';
import TerminateRiderDialog from '../features/riders/TerminateRiderDialog';

const RIDER_STATUSES = [
    { status: 'Active', icon: 'userCheck' },
    { status: 'Inactive', icon: 'userPause' },
    { status: 'Terminated', icon: 'userX' }
];
const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;

// Status, search and page live in the URL so a filtered view can be linked or reloaded.
export default function RidersPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedStatus = searchParams.get('status');
    const status = RIDER_STATUSES.some(item => item.status === requestedStatus) ? requestedStatus : 'Active';
    const search = searchParams.get('search') ?? '';
    const page = Math.max(Number(searchParams.get('page')) || 1, 1);

    const { refreshKey } = useWeek();
    const showToast = useToast();

    const [searchInput, setSearchInput] = useState(search);
    // Bumped after a change on this page to refetch; refreshKey does the same for the top bar's Refresh.
    const [reloadKey, setReloadKey] = useState(0);
    // Editing, status changes and inactive days happen on the rider page.
    const [adding, setAdding] = useState(false);
    const [terminating, setTerminating] = useState(null);

    const list = useApi(
        options => getRiders({ status, search, page, limit: PAGE_SIZE }, options),
        [status, search, page, refreshKey, reloadKey]
    );
    const summary = useApi(options => getRiderSummary(options), [refreshKey, reloadKey]);

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

    // After a rider leaves this tab, the last page can end up empty; step back to a real one.
    const totalPages = list.data?.pagination.totalPages ?? 0;
    useEffect(() => {
        if (list.data && page > 1 && page > totalPages) {
            updateParams({ page: totalPages > 1 ? totalPages : undefined });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [list.data, page, totalPages]);

    const reload = () => setReloadKey(key => key + 1);

    // Errors are not caught here: they reject back to the dialog, which shows them.
    async function handleAdd(values) {
        await createRider(values);
        showToast({ message: `${values.name} added as an Active rider` });
        setAdding(false);
        reload();
    }

    return (
        <>
            <PageHeader
                breadcrumbs={[{ label: 'Riders', to: '/riders' }, { label: 'Management' }]}
                title="Rider Management"
                subtitle="Add riders, update their details and manage their status."
                actions={
                    <button type="button" className="button" onClick={() => setAdding(true)}>
                        <Icon name="plus" size={16} />
                        Add rider
                    </button>
                }
            />

            <div className="search-box">
                <Icon name="search" />
                <input
                    type="search"
                    value={searchInput}
                    onChange={event => setSearchInput(event.target.value)}
                    placeholder="Search by name, phone, or rider ID…"
                    aria-label="Search riders"
                />
            </div>

            <StatusTabs
                label="Rider status"
                tabs={RIDER_STATUSES.map(item => ({
                    value: item.status,
                    label: item.status,
                    icon: item.icon,
                    count: summary.data?.[item.status]
                }))}
                value={status}
                onChange={next => updateParams({ status: next === 'Active' ? undefined : next, page: undefined })}
            />

            {list.loading && <LoadingSkeleton variant="table" rows={8} />}

            {list.error && <ErrorState title="Could not load riders" error={list.error} onRetry={list.retry} />}

            {list.data && (
                <section className="card card--flush">
                    {list.data.riders.length ? (
                        <>
                            <RidersTable riders={list.data.riders} onTerminate={setTerminating} />
                            <Pagination
                                {...list.data.pagination}
                                onPageChange={next => updateParams({ page: next > 1 ? next : undefined })}
                            />
                        </>
                    ) : (
                        <div className="card__empty">
                            <EmptyState
                                message={search
                                    ? `No ${status.toLowerCase()} riders match “${search}”.`
                                    : `No ${status.toLowerCase()} riders yet.`}
                            />
                        </div>
                    )}
                </section>
            )}

            {adding && <RiderFormDialog rider={null} onSubmit={handleAdd} onClose={() => setAdding(false)} />}

            <TerminateRiderDialog
                rider={terminating}
                onTerminated={() => {
                    setTerminating(null);
                    reload();
                }}
                onCancel={() => setTerminating(null)}
            />
        </>
    );
}
