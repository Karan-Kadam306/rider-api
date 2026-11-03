import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
    assignBike,
    createBike,
    getBikes,
    getBikeSummary,
    returnBike,
    updateBikeStatus
} from '../api/bikesApi';
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
import BikesTable from '../features/bikes/BikesTable';
import BikeFormDialog from '../features/bikes/BikeFormDialog';
import AssignBikeDialog from '../features/bikes/AssignBikeDialog';
import BikeHistoryPanel from '../features/bikes/BikeHistoryPanel';
import { bikeLabel } from '../utils/bikeLabel';

// "All" is a UI-only tab: the API returns every status when no status is sent.
const BIKE_TABS = [
    { value: 'All', icon: 'bike', countKey: 'total' },
    { value: 'Available', icon: 'circleCheck' },
    { value: 'Assigned', icon: 'userCheck' },
    { value: 'Maintenance', icon: 'wrench' }
];
const PAGE_SIZE = 20;


// Status, search and page live in the URL so a filtered view can be linked or reloaded.
export default function BikesPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedStatus = searchParams.get('status');
    const status = BIKE_TABS.some(tab => tab.value === requestedStatus) ? requestedStatus : 'All';
    const search = searchParams.get('search') ?? '';
    const page = Math.max(Number(searchParams.get('page')) || 1, 1);

    const { refreshKey } = useWeek();
    const showToast = useToast();

    const [searchInput, setSearchInput] = useState(search);
    // Registrations are stored without spaces (MH12AB1234), so "MH 12" must be sent as "MH12".
    const debouncedSearch = useDebouncedValue(searchInput.replace(/\s+/g, ''));
    const [reloadKey, setReloadKey] = useState(0);
    const [adding, setAdding] = useState(false);
    const [assigning, setAssigning] = useState(null);
    const [returning, setReturning] = useState(null);
    const [returnBusy, setReturnBusy] = useState(false);
    const [historyBike, setHistoryBike] = useState(null);

    const list = useApi(
        options => getBikes({ status: status === 'All' ? undefined : status, search, page, limit: PAGE_SIZE }, options),
        [status, search, page, refreshKey, reloadKey]
    );
    const summary = useApi(options => getBikeSummary(options), [refreshKey, reloadKey]);

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

    // After a bike leaves this tab, the last page can end up empty; step back to a real one.
    const totalPages = list.data?.pagination.totalPages ?? 0;
    useEffect(() => {
        if (list.data && page > 1 && page > totalPages) {
            updateParams({ page: totalPages > 1 ? totalPages : undefined });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [list.data, page, totalPages]);

    const reload = () => setReloadKey(key => key + 1);

    async function handleAdd(values) {
        const bike = await createBike(values);
        showToast({ message: `${bikeLabel(bike)} added as Available` });
        setAdding(false);
        reload();
    }

    async function handleAssign({ rider, idempotencyKey }) {
        await assignBike({ bikeId: assigning.bikeId, riderId: rider.rider_id, idempotencyKey });
        showToast({ message: `${bikeLabel(assigning)} assigned to ${rider.name}` });
        setAssigning(null);
        reload();
    }

    async function handleChangeStatus(bike, nextStatus) {
        try {
            await updateBikeStatus(bike.bikeId, nextStatus);
            showToast({
                message: nextStatus === 'Maintenance'
                    ? `${bikeLabel(bike)} sent to maintenance`
                    : `${bikeLabel(bike)} is Available again`
            });
            reload();
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        }
    }

    async function handleReturn() {
        setReturnBusy(true);

        try {
            await returnBike(returning.bikeId);
            showToast({ message: `${bikeLabel(returning)} returned and now Available` });
            setReturning(null);
            reload();
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        } finally {
            setReturnBusy(false);
        }
    }

    return (
        <>
            <PageHeader
                breadcrumbs={[{ label: 'Bikes', to: '/bikes' }, { label: 'Management' }]}
                title="Bike Management"
                subtitle="Add bikes, assign them to riders, and track who had each bike."
                actions={
                    <button type="button" className="button" onClick={() => setAdding(true)}>
                        <Icon name="plus" size={16} />
                        Add bike
                    </button>
                }
            />

            <div className="search-box">
                <Icon name="search" />
                <input
                    type="search"
                    value={searchInput}
                    onChange={event => setSearchInput(event.target.value)}
                    placeholder="Search by registration or chassis number…"
                    aria-label="Search bikes"
                />
            </div>

            <StatusTabs
                label="Bike status"
                tabs={BIKE_TABS.map(tab => ({
                    value: tab.value,
                    label: tab.value,
                    icon: tab.icon,
                    count: summary.data?.[tab.countKey ?? tab.value]
                }))}
                value={status}
                onChange={next => updateParams({ status: next === 'All' ? undefined : next, page: undefined })}
            />

            {list.loading && <LoadingSkeleton variant="table" rows={8} />}

            {list.error && <ErrorState title="Could not load bikes" error={list.error} onRetry={list.retry} />}

            {list.data && (
                <section className="card card--flush">
                    {list.data.bikes.length ? (
                        <>
                            <BikesTable
                                bikes={list.data.bikes}
                                onAssign={setAssigning}
                                onReturn={setReturning}
                                onChangeStatus={handleChangeStatus}
                                onShowHistory={setHistoryBike}
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
                                    ? `No bikes match “${search}”.`
                                    : status === 'All' ? 'No bikes yet.' : `No ${status.toLowerCase()} bikes.`}
                            />
                        </div>
                    )}
                </section>
            )}

            {adding && <BikeFormDialog onSubmit={handleAdd} onClose={() => setAdding(false)} />}

            {assigning && (
                <AssignBikeDialog bike={assigning} onSubmit={handleAssign} onClose={() => setAssigning(null)} />
            )}

            {historyBike && <BikeHistoryPanel bike={historyBike} onClose={() => setHistoryBike(null)} />}

            <ConfirmDialog
                open={Boolean(returning)}
                title="Return bike?"
                message={returning && (
                    <p>
                        <strong>{bikeLabel(returning)}</strong> will be returned from{' '}
                        <strong>{returning.currentRider?.name}</strong> and become Available.
                    </p>
                )}
                confirmLabel="Return bike"
                busy={returnBusy}
                onConfirm={handleReturn}
                onCancel={() => setReturning(null)}
            />
        </>
    );
}
