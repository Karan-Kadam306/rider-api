import { Link, useParams, useSearchParams } from 'react-router-dom';

import { getRiderProfile } from '../api/ridersApi';
import { useApi } from '../hooks/useApi';
import { useWeek } from '../context/WeekContext';
import PageHeader from '../components/layout/PageHeader';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import Icon from '../components/ui/Icon';
import StatusBadge from '../components/ui/StatusBadge';
import StatusTabs from '../components/ui/StatusTabs';
import RiderOverview from '../features/riders/RiderOverview';
import RiderEarningsTab from '../features/riders/RiderEarningsTab';
import RiderHistoryTab from '../features/riders/RiderHistoryTab';

const TABS = [
    { value: 'overview', label: 'Overview', icon: 'users' },
    { value: 'earnings', label: 'Earnings', icon: 'wallet' },
    { value: 'history', label: 'History', icon: 'clock' }
];

// One rider's page, opened from Details in the riders list. The tab lives in the URL
// so a refresh or a shared link opens the same tab.
export default function RiderDetailPage() {
    const { riderId } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedTab = searchParams.get('tab');
    const tab = TABS.some(item => item.value === requestedTab) ? requestedTab : 'overview';

    const { refreshKey } = useWeek();
    const profile = useApi(options => getRiderProfile(riderId, options), [riderId, refreshKey]);
    const rider = profile.data?.rider;

    return (
        <>
            <PageHeader
                breadcrumbs={[{ label: 'Riders', to: '/riders' }, { label: rider?.name ?? riderId }]}
                title={
                    <span className="rider-title">
                        <Link to="/riders" className="button button--icon" aria-label="Back to riders">
                            <Icon name="chevronLeft" size={16} />
                        </Link>
                        {rider?.name ?? riderId}
                        {rider && <StatusBadge status={rider.status} />}
                    </span>
                }
                subtitle={rider && <span className="mono">{rider.riderId} · {rider.phone}</span>}
            />

            {profile.loading && <LoadingSkeleton variant="table" rows={6} />}

            {profile.error && (
                <ErrorState
                    title={profile.error.status === 404 ? 'Rider not found' : 'Could not load this rider'}
                    error={profile.error}
                    onRetry={profile.error.status === 404 ? undefined : profile.retry}
                />
            )}

            {profile.data && (
                <>
                    <StatusTabs
                        label="Rider sections"
                        tabs={TABS}
                        value={tab}
                        onChange={next => setSearchParams(next === 'overview' ? {} : { tab: next }, { replace: true })}
                    />

                    {tab === 'overview' && <RiderOverview profile={profile.data} />}
                    {tab === 'earnings' && <RiderEarningsTab riderId={riderId} />}
                    {tab === 'history' && <RiderHistoryTab riderId={riderId} />}
                </>
            )}
        </>
    );
}
