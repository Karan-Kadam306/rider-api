import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { getRiderProfile } from '../api/ridersApi';
import { raiseEscalation } from '../api/escalationsApi';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useWeek } from '../context/WeekContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/layout/PageHeader';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import Icon from '../components/ui/Icon';
import StatusBadge from '../components/ui/StatusBadge';
import StatusTabs from '../components/ui/StatusTabs';
import RiderOverview from '../features/riders/RiderOverview';
import RiderEarningsTab from '../features/riders/RiderEarningsTab';
import RiderHistoryTab from '../features/riders/RiderHistoryTab';
import RiderEscalationsTab from '../features/riders/RiderEscalationsTab';
import EscalateDialog from '../features/riders/EscalateDialog';
import TeamLeadersPanel from '../features/riders/TeamLeadersPanel';

const TABS = [
    { value: 'overview', label: 'Overview', icon: 'users' },
    { value: 'earnings', label: 'Earnings', icon: 'wallet' },
    { value: 'history', label: 'History', icon: 'clock' },
    { value: 'escalations', label: 'Escalations', icon: 'shield' }
];

// One rider's page, opened from Details in the riders list. The tab lives in the URL
// so a refresh or a shared link opens the same tab.
export default function RiderDetailPage() {
    const { riderId } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedTab = searchParams.get('tab');
    const tab = TABS.some(item => item.value === requestedTab) ? requestedTab : 'overview';

    const { isAdmin, isTeamLeader } = useAuth();
    // Team leaders reach this page from My Riders, not from Rider Management.
    const backTo = isTeamLeader ? { label: 'My Riders', to: '/my-riders' } : { label: 'Riders', to: '/riders' };
    const { refreshKey } = useWeek();
    const showToast = useToast();
    // Bumped after an escalation changes, so the balance, banner and list all reload.
    const [reloadKey, setReloadKey] = useState(0);
    const [escalating, setEscalating] = useState(false);

    const profile = useApi(options => getRiderProfile(riderId, options), [riderId, refreshKey, reloadKey]);
    const rider = profile.data?.rider;
    const openEscalations = profile.data?.openEscalations ?? [];

    const reload = () => setReloadKey(key => key + 1);
    const openTab = next => setSearchParams(next === 'overview' ? {} : { tab: next }, { replace: true });

    // Errors are not caught here: they reject back to the dialog, which shows them.
    async function handleEscalate(values) {
        const escalation = await raiseEscalation(riderId, values);

        showToast(escalation.lockStatus === 'Failed'
            ? { type: 'error', message: 'Escalation raised, but the bike could not be locked. Retry from the Escalations tab.' }
            : { message: 'Escalation raised' });
        setEscalating(false);
        reload();
        openTab('escalations');
    }

    return (
        <>
            <PageHeader
                breadcrumbs={[backTo, { label: rider?.name ?? riderId }]}
                title={
                    <span className="rider-title">
                        <Link to={backTo.to} className="button button--icon" aria-label={`Back to ${backTo.label}`}>
                            <Icon name="chevronLeft" size={16} />
                        </Link>
                        {rider?.name ?? riderId}
                        {rider && <StatusBadge status={rider.status} />}
                    </span>
                }
                subtitle={rider && <span className="mono">{rider.riderId} · {rider.phone}</span>}
                actions={isAdmin && rider && rider.status !== 'Terminated' && (
                    <button type="button" className="button button--danger" onClick={() => setEscalating(true)}>
                        <Icon name="shield" size={16} />
                        Escalate
                    </button>
                )}
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
                    {openEscalations.length > 0 && tab !== 'escalations' && (
                        <p className="escalation-banner" role="status">
                            {openEscalations.length === 1 ? '1 open escalation' : `${openEscalations.length} open escalations`}
                            {' — '}
                            <button type="button" className="button button--link" onClick={() => openTab('escalations')}>
                                View escalations
                            </button>
                        </p>
                    )}

                    <StatusTabs label="Rider sections" tabs={TABS} value={tab} onChange={openTab} />

                    {tab === 'overview' && (
                        <>
                            <RiderOverview profile={profile.data} showStaffLinks={!isTeamLeader} />
                            {!isTeamLeader && <TeamLeadersPanel rider={rider} isAdmin={isAdmin} />}
                        </>
                    )}
                    {tab === 'earnings' && <RiderEarningsTab riderId={riderId} />}
                    {tab === 'history' && <RiderHistoryTab riderId={riderId} />}
                    {tab === 'escalations' && (
                        <RiderEscalationsTab riderId={riderId} reloadKey={reloadKey} onChanged={reload} />
                    )}
                </>
            )}

            {escalating && profile.data && (
                <EscalateDialog
                    rider={rider}
                    outstandingBalance={profile.data.outstandingBalance}
                    onSubmit={handleEscalate}
                    onClose={() => setEscalating(false)}
                />
            )}
        </>
    );
}
