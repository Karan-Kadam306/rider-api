import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getRiders, getRiderSummary } from '../api/ridersApi';
import { getApplicationCounts, getApplications } from '../api/onboardingApi';
import { getHubs } from '../api/hubsApi';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useWeek } from '../context/WeekContext';
import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import Icon from '../components/ui/Icon';
import Pagination from '../components/ui/Pagination';
import StatusTabs from '../components/ui/StatusTabs';
import RidersTable from '../features/riders/RidersTable';
import ApplicationsTable from '../features/onboarding/ApplicationsTable';
import TerminateRiderDialog from '../features/riders/TerminateRiderDialog';

// Onboarding tabs list applications; the last three list riders.
const APPLICATION_TABS = [
    { value: 'review', label: 'Review', icon: 'eye' },
    { value: 'reapprove', label: 'Re-approve', icon: 'refresh' },
    { value: 'hold', label: 'On Hold', icon: 'clock' },
    { value: 'payment', label: 'Payment', icon: 'wallet' },
    { value: 'bike', label: 'Bike', icon: 'bike' },
    { value: 'rejected', label: 'Rejected', icon: 'close' },
    { value: 'all', label: 'All applications', icon: 'file' }
];
const RIDER_TABS = [
    { value: 'active', label: 'Active', icon: 'userCheck', status: 'Active' },
    { value: 'inactive', label: 'Inactive', icon: 'userPause', status: 'Inactive' },
    { value: 'terminated', label: 'Terminated', icon: 'userX', status: 'Terminated' }
];
const PLAN_TYPES = ['Postpaid', 'Prepaid'];
const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;

// Tab, hub, plan, test riders, search and page live in the URL so a filtered view can be linked or reloaded.
// Riders are no longer added here: they are created by approving an application.
// Onboarding users see the rider tabs read-only (the rider page is not theirs).
export default function RidersPage() {
    const { isOnboarding } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedTab = searchParams.get('tab');
    const allTabs = [...APPLICATION_TABS, ...RIDER_TABS];
    const tab = allTabs.some(item => item.value === requestedTab) ? requestedTab : isOnboarding ? 'review' : 'active';
    const riderTab = RIDER_TABS.find(item => item.value === tab);
    const hubId = searchParams.get('hubId') ?? '';
    const planType = searchParams.get('planType') ?? '';
    const includeTest = searchParams.get('includeTest') === 'true';
    const search = searchParams.get('search') ?? '';
    const page = Math.max(Number(searchParams.get('page')) || 1, 1);

    const { refreshKey } = useWeek();
    const [searchInput, setSearchInput] = useState(search);
    // Bumped after a change on this page to refetch; refreshKey does the same for the top bar's Refresh.
    const [reloadKey, setReloadKey] = useState(0);
    const [terminating, setTerminating] = useState(null);

    // Plan applies to applications only.
    const applicationFilters = { hubId, planType, includeTest, search };
    const list = useApi(
        options => (riderTab
            ? getRiders({ status: riderTab.status, hubId, includeTest, search, page, limit: PAGE_SIZE }, options)
            : getApplications({ tab, ...applicationFilters, page, limit: PAGE_SIZE }, options)),
        [tab, hubId, planType, includeTest, search, page, refreshKey, reloadKey]
    );
    const riderCounts = useApi(
        options => getRiderSummary({ hubId, includeTest, ...options }),
        [hubId, includeTest, refreshKey, reloadKey]
    );
    const applicationCounts = useApi(
        options => getApplicationCounts(applicationFilters, options),
        [hubId, planType, includeTest, search, refreshKey]
    );
    const hubs = useApi(options => getHubs(options), [refreshKey]);

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

    const rows = riderTab ? list.data?.riders : list.data?.applications;
    const tabLabel = allTabs.find(item => item.value === tab).label.toLowerCase();

    return (
        <>
            <PageHeader
                breadcrumbs={[{ label: 'Riders', to: '/riders' }, { label: 'Management' }]}
                title="Rider Management"
                subtitle="Review new applications and manage riders. Riders are created by approving their application."
            />

            <div className="km-filters">
                <div className="search-box km-filters__search">
                    <Icon name="search" />
                    <input
                        type="search"
                        value={searchInput}
                        onChange={event => setSearchInput(event.target.value)}
                        placeholder={riderTab ? 'Search by name, phone, or rider ID…' : 'Search by name, phone, application no. or rider code…'}
                        aria-label="Search"
                    />
                </div>
                <select
                    className="select"
                    aria-label="Filter by hub"
                    value={hubId}
                    onChange={event => updateParams({ hubId: event.target.value, page: undefined })}
                >
                    <option value="">All hubs</option>
                    {hubs.data?.map(hub => (
                        <option key={hub.hubId} value={hub.hubId}>
                            {hub.name}{hub.isActive ? '' : ' (inactive)'}
                        </option>
                    ))}
                </select>
                {!riderTab && (
                    <select
                        className="select"
                        aria-label="Filter by plan"
                        value={planType}
                        onChange={event => updateParams({ planType: event.target.value, page: undefined })}
                    >
                        <option value="">All plans</option>
                        {PLAN_TYPES.map(plan => <option key={plan} value={plan}>{plan}</option>)}
                    </select>
                )}
                <label className="checkbox">
                    <input
                        type="checkbox"
                        checked={includeTest}
                        onChange={event => updateParams({ includeTest: event.target.checked ? 'true' : undefined, page: undefined })}
                    />
                    Show test users
                </label>
            </div>

            <StatusTabs
                label="Applications and riders"
                tabs={[
                    ...APPLICATION_TABS.map(item => ({ ...item, count: applicationCounts.data?.[item.value] })),
                    ...RIDER_TABS.map(item => ({ ...item, count: riderCounts.data?.[item.status] }))
                ]}
                value={tab}
                onChange={next => updateParams({ tab: next, page: undefined })}
            />

            {list.loading && <LoadingSkeleton variant="table" rows={8} />}

            {list.error && <ErrorState title={`Could not load ${tabLabel}`} error={list.error} onRetry={list.retry} />}

            {list.data && (
                <section className="card card--flush">
                    {rows.length ? (
                        <>
                            {riderTab
                                ? <RidersTable riders={rows} onTerminate={setTerminating} readOnly={isOnboarding} />
                                : <ApplicationsTable applications={rows} tab={tab} />}
                            <Pagination
                                {...list.data.pagination}
                                onPageChange={next => updateParams({ page: next > 1 ? next : undefined })}
                            />
                        </>
                    ) : (
                        <div className="card__empty">
                            <EmptyState
                                message={search || hubId || planType
                                    ? `Nothing in ${tabLabel} matches these filters.`
                                    : `Nothing in ${tabLabel} yet.`}
                            />
                        </div>
                    )}
                </section>
            )}

            <TerminateRiderDialog
                rider={terminating}
                onTerminated={() => {
                    setTerminating(null);
                    setReloadKey(key => key + 1);
                }}
                onCancel={() => setTerminating(null)}
            />
        </>
    );
}
