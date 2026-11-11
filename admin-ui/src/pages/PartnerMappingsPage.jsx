import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getPartnerMappings, getPartners, moveEarnings, saveRiderMappings } from '../api/partnersApi';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useWeek } from '../context/WeekContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import Icon from '../components/ui/Icon';
import Pagination from '../components/ui/Pagination';
import StatusTabs from '../components/ui/StatusTabs';
import RiderMappingsTable from '../features/partnerMappings/RiderMappingsTable';
import MoveEarningsDialog from '../features/partnerMappings/MoveEarningsDialog';

const VIEWS = [
    { value: 'unmapped', label: 'Without Mappings', icon: 'userX' },
    { value: 'mapped', label: 'Mapped', icon: 'link' }
];
const RIDER_STATUSES = ['Active', 'Inactive', 'Terminated'];
const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;

// View, status, search and page live in the URL so a filtered view can be linked or reloaded.
export default function PartnerMappingsPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const view = searchParams.get('view') === 'mapped' ? 'mapped' : 'unmapped';
    const requestedStatus = searchParams.get('status');
    const status = RIDER_STATUSES.includes(requestedStatus) ? requestedStatus : '';
    const search = searchParams.get('search') ?? '';
    const page = Math.max(Number(searchParams.get('page')) || 1, 1);

    const { refreshKey } = useWeek();
    const showToast = useToast();
    // Only admins can move earnings; the API enforces the same rule.
    const { isAdmin } = useAuth();

    const [searchInput, setSearchInput] = useState(search);
    const [reloadKey, setReloadKey] = useState(0);
    const [openRiderId, setOpenRiderId] = useState(null);
    const [movingRider, setMovingRider] = useState(null);

    const partners = useApi(options => getPartners(options), [refreshKey]);
    const list = useApi(
        options => getPartnerMappings({ view, status, search, page, limit: PAGE_SIZE }, options),
        [view, status, search, page, refreshKey, reloadKey]
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

    // A saved rider can move to the other tab and leave the last page empty; step back to a real one.
    const totalPages = list.data?.pagination.totalPages ?? 0;
    useEffect(() => {
        if (list.data && page > 1 && page > totalPages) {
            updateParams({ page: totalPages > 1 ? totalPages : undefined });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [list.data, page, totalPages]);

    // Errors are not caught here: they reject back to the editor, which shows them.
    async function handleSave(rider, mappings) {
        const result = await saveRiderMappings(rider.riderId, mappings);

        const matched = result.matchedEarnings > 0
            ? `; ${result.matchedEarnings} pending ${result.matchedEarnings === 1 ? 'entry' : 'entries'} matched`
            : '';

        showToast({
            message: result.rider.mappings.length
                ? `${rider.name}: partner mappings saved${matched}`
                : `${rider.name} no longer has partner mappings`
        });
        setOpenRiderId(null);
        setReloadKey(key => key + 1);
    }

    // Errors reject back to the dialog, which shows them.
    async function handleMove(move) {
        const result = await moveEarnings(move);

        showToast({
            message: `${result.movedEarnings} ${result.partnerName} ${result.movedEarnings === 1 ? 'entry' : 'entries'} moved to ${result.riderName}`
        });
        setMovingRider(null);
    }

    const error = list.error ?? partners.error;
    const retry = () => {
        list.retry();
        partners.retry();
    };

    return (
        <>
            <PageHeader
                breadcrumbs={[{ label: 'Riders', to: '/riders' }, { label: 'Partner Mappings' }]}
                title="Partner Mappings"
                subtitle="Link each rider to the ID every delivery partner uses, so imported earnings reach the right rider."
            />

            <div className="km-filters">
                <div className="search-box km-filters__search">
                    <Icon name="search" />
                    <input
                        type="search"
                        value={searchInput}
                        onChange={event => setSearchInput(event.target.value)}
                        placeholder="Search by name, phone, rider ID or partner ID…"
                        aria-label="Search riders"
                    />
                </div>
                <select
                    className="select"
                    aria-label="Filter by rider status"
                    value={status}
                    onChange={event => updateParams({ status: event.target.value, page: undefined })}
                >
                    <option value="">All statuses</option>
                    {RIDER_STATUSES.map(item => (
                        <option key={item} value={item}>{item}</option>
                    ))}
                </select>
            </div>

            <StatusTabs
                label="Mapping status"
                tabs={VIEWS.map(item => ({ ...item, count: list.data?.counts[item.value] }))}
                value={view}
                onChange={next => updateParams({ view: next === 'unmapped' ? undefined : next, page: undefined })}
            />

            {(list.loading || partners.loading) && !error && <LoadingSkeleton variant="table" rows={8} />}

            {error && <ErrorState title="Could not load partner mappings" error={error} onRetry={retry} />}

            {list.data && partners.data && (
                <section className="card card--flush">
                    {list.data.riders.length ? (
                        <>
                            <RiderMappingsTable
                                riders={list.data.riders}
                                partners={partners.data}
                                openRiderId={openRiderId}
                                onToggle={riderId => setOpenRiderId(current => (current === riderId ? null : riderId))}
                                onSave={handleSave}
                                onMove={isAdmin ? setMovingRider : undefined}
                            />
                            <Pagination
                                {...list.data.pagination}
                                onPageChange={next => updateParams({ page: next > 1 ? next : undefined })}
                            />
                        </>
                    ) : (
                        <div className="card__empty">
                            <EmptyState
                                message={search || status
                                    ? 'No riders match these filters.'
                                    : view === 'mapped'
                                        ? 'No riders are mapped yet.'
                                        : 'No riders without partner mappings.'}
                            />
                        </div>
                    )}
                </section>
            )}

            {movingRider && (
                <MoveEarningsDialog rider={movingRider} onSubmit={handleMove} onClose={() => setMovingRider(null)} />
            )}
        </>
    );
}
