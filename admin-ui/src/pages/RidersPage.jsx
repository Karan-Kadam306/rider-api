import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { createRider, getRiders, getRiderSummary, terminateRider, updateRider } from '../api/ridersApi';
import { useApi } from '../hooks/useApi';
import { useWeek } from '../context/WeekContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import ConfirmDialog from '../components/feedback/ConfirmDialog';
import Icon from '../components/ui/Icon';
import Pagination from '../components/ui/Pagination';
import RiderStatusTabs, { RIDER_STATUSES } from '../features/riders/RiderStatusTabs';
import RidersTable from '../features/riders/RidersTable';
import RiderFormDialog from '../features/riders/RiderFormDialog';

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
    const [reloadKey, setReloadKey] = useState(0);
    // null = closed, { rider: null } = add, { rider } = edit
    const [formState, setFormState] = useState(null);
    const [terminating, setTerminating] = useState(null);
    const [terminateBusy, setTerminateBusy] = useState(false);

    const list = useApi(
        options => getRiders({ status, search, page, limit: PAGE_SIZE }, options),
        [status, search, page, refreshKey, reloadKey]
    );
    const summary = useApi(options => getRiderSummary(options), [refreshKey, reloadKey]);

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

    async function handleSave(values) {
        if (formState.rider) {
            const rider = formState.rider;
            await updateRider(rider.rider_id, { name: values.name, phone: values.phone, status: rider.status });
            showToast({ message: `${values.name} updated` });
        } else {
            await createRider(values);
            showToast({ message: `${values.name} added as an Active rider` });
        }

        setFormState(null);
        reload();
    }

    async function handleToggleStatus(rider) {
        const nextStatus = rider.status === 'Active' ? 'Inactive' : 'Active';

        try {
            await updateRider(rider.rider_id, { name: rider.name, phone: rider.phone, status: nextStatus });
            showToast({ message: `${rider.name} is now ${nextStatus}` });
            reload();
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        }
    }

    async function handleTerminate() {
        setTerminateBusy(true);

        try {
            const result = await terminateRider(terminating.rider_id);
            const bikeNote = result.returnedAssignment
                ? ` Bike ${result.returnedAssignment.bike_id} was returned.`
                : '';
            showToast({ message: `${terminating.name} terminated.${bikeNote}` });
            setTerminating(null);
            reload();
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        } finally {
            setTerminateBusy(false);
        }
    }

    return (
        <>
            <PageHeader
                breadcrumbs={[{ label: 'Riders', to: '/riders' }, { label: 'Management' }]}
                title="Rider Management"
                subtitle="Add riders, update their details and manage their status."
                actions={
                    <button type="button" className="button" onClick={() => setFormState({ rider: null })}>
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

            <RiderStatusTabs
                value={status}
                counts={summary.data}
                onChange={next => updateParams({ status: next === 'Active' ? undefined : next, page: undefined })}
            />

            {list.loading && <LoadingSkeleton variant="table" rows={8} />}

            {list.error && <ErrorState title="Could not load riders" error={list.error} onRetry={list.retry} />}

            {list.data && (
                <section className="card card--flush">
                    {list.data.riders.length ? (
                        <>
                            <RidersTable
                                riders={list.data.riders}
                                onEdit={rider => setFormState({ rider })}
                                onToggleStatus={handleToggleStatus}
                                onTerminate={setTerminating}
                            />
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

            {formState && (
                <RiderFormDialog rider={formState.rider} onSubmit={handleSave} onClose={() => setFormState(null)} />
            )}

            <ConfirmDialog
                open={Boolean(terminating)}
                title="Terminate rider?"
                message={terminating && (
                    <>
                        <p>
                            <strong>{terminating.name}</strong> ({terminating.rider_id}) will be terminated from today.
                            Any bike assigned to them will be returned.
                        </p>
                        <p>This cannot be undone.</p>
                    </>
                )}
                confirmLabel="Terminate"
                busy={terminateBusy}
                onConfirm={handleTerminate}
                onCancel={() => setTerminating(null)}
            />
        </>
    );
}
