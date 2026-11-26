import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { getRiderProfile, updateRider } from '../api/ridersApi';
import { raiseEscalation } from '../api/escalationsApi';
import { logFollowUp } from '../api/followUpsApi';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useWeek } from '../context/WeekContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/layout/PageHeader';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import Icon from '../components/ui/Icon';
import StatusBadge from '../components/ui/StatusBadge';
import CurrencyText from '../components/ui/CurrencyText';
import { formatDate } from '../utils/formatDate';
import StatusTabs from '../components/ui/StatusTabs';
import RiderOverview from '../features/riders/RiderOverview';
import RiderEarningsTab from '../features/riders/RiderEarningsTab';
import RiderHistoryTab from '../features/riders/RiderHistoryTab';
import RiderEscalationsTab from '../features/riders/RiderEscalationsTab';
import EscalateDialog from '../features/riders/EscalateDialog';
import TeamLeadersPanel from '../features/riders/TeamLeadersPanel';
import RiderFollowUpsTab from '../features/riders/RiderFollowUpsTab';
import RiderOnboardingTab from '../features/riders/RiderOnboardingTab';
import RiderDocumentsTab from '../features/riders/RiderDocumentsTab';
import FollowUpDialog from '../features/riders/FollowUpDialog';
import RiderFormDialog from '../features/riders/RiderFormDialog';
import InactivePeriodsPanel from '../features/riders/InactivePeriodsPanel';
import TerminateRiderDialog from '../features/riders/TerminateRiderDialog';

const TABS = [
    { value: 'overview', label: 'Overview', icon: 'users' },
    { value: 'earnings', label: 'Earnings', icon: 'wallet' },
    { value: 'history', label: 'History', icon: 'clock' },
    { value: 'escalations', label: 'Escalations', icon: 'shield' },
    { value: 'follow-ups', label: 'Follow-ups', icon: 'edit' }
];
// What the rider sent from the app at joining. Not for team leaders: the API refuses them too.
const STAFF_TABS = [
    { value: 'onboarding', label: 'Onboarding', icon: 'userCheck' },
    { value: 'documents', label: 'Documents', icon: 'file' }
];

// One rider's page, opened from Details in the riders list. The tab lives in the URL
// so a refresh or a shared link opens the same tab.
export default function RiderDetailPage() {
    const { riderId } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const { isAdmin, isTeamLeader } = useAuth();
    const tabs = isTeamLeader ? TABS : [...TABS, ...STAFF_TABS];
    const requestedTab = searchParams.get('tab');
    const tab = tabs.some(item => item.value === requestedTab) ? requestedTab : 'overview';

    // Team leaders reach this page from My Riders, not from Rider Management.
    const backTo = isTeamLeader ? { label: 'My Riders', to: '/my-riders' } : { label: 'Riders', to: '/riders' };
    const { refreshKey } = useWeek();
    const showToast = useToast();
    // Bumped after an escalation changes, so the balance, banner and list all reload.
    const [reloadKey, setReloadKey] = useState(0);
    const [escalating, setEscalating] = useState(false);
    const [loggingFollowUp, setLoggingFollowUp] = useState(false);
    const [editing, setEditing] = useState(false);
    const [showingInactiveDays, setShowingInactiveDays] = useState(false);
    const [terminating, setTerminating] = useState(false);

    const profile = useApi(options => getRiderProfile(riderId, options), [riderId, refreshKey, reloadKey]);
    const rider = profile.data?.rider;
    const openEscalations = profile.data?.openEscalations ?? [];
    const activePromise = profile.data?.activePromise ?? null;
    const paymentClaim = profile.data?.paymentClaim ?? null;
    // Admins raise any escalation; team leaders only a Record (no lock, no payment link).
    const canEscalate = (isAdmin || isTeamLeader) && rider && rider.status !== 'Terminated';
    // Edit, status, inactive days and terminate are for admins and staff, as on Rider Management.
    const canManage = !isTeamLeader && rider && rider.status !== 'Terminated';
    // The edit, inactive days and terminate dialogs take a rider shaped like a riders-list row.
    const riderRow = rider && { rider_id: rider.riderId, name: rider.name, phone: rider.phone, status: rider.status };

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

    // Errors reject back to the dialog, as above.
    async function handleLogFollowUp(values) {
        await logFollowUp(riderId, values);

        showToast({ message: 'Follow-up saved' });
        setLoggingFollowUp(false);
        reload();
        openTab('follow-ups');
    }

    // Errors reject back to the dialog, as above.
    async function handleSave(values) {
        // The API needs every field, so send the current status unchanged.
        await updateRider(rider.riderId, { name: values.name, phone: values.phone, status: rider.status });

        showToast({ message: `${values.name} updated` });
        setEditing(false);
        reload();
    }

    async function handleToggleStatus() {
        const nextStatus = rider.status === 'Active' ? 'Inactive' : 'Active';

        try {
            await updateRider(rider.riderId, { name: rider.name, phone: rider.phone, status: nextStatus });
            showToast({ message: `${rider.name} is now ${nextStatus}` });
            reload();
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        }
    }

    return (
        <>
            <PageHeader
                variant="detail"
                breadcrumbs={[backTo, { label: rider?.name ?? riderId }]}
                title={
                    <span className="rider-title">
                        <Link to={backTo.to} className="button button--icon" aria-label={`Back to ${backTo.label}`}>
                            <Icon name="chevronLeft" size={18} />
                        </Link>
                        {rider?.name ?? riderId}
                        {rider && <StatusBadge status={rider.status} />}
                    </span>
                }
                subtitle={rider && <span className="mono">{rider.riderId} · {rider.phone}</span>}
                actions={rider && (
                    // Everyday actions first, Terminate last as the only solid red button.
                    <>
                        <button type="button" className="button" onClick={() => setLoggingFollowUp(true)}>
                            <Icon name="edit" size={16} />
                            Log follow-up
                        </button>
                        {canManage && (
                            <>
                                <button
                                    type="button"
                                    className="button button--secondary"
                                    onClick={() => setShowingInactiveDays(true)}
                                >
                                    <Icon name="clock" size={16} />
                                    Inactive days
                                </button>
                                <button
                                    type="button"
                                    className={`button ${rider.status === 'Active' ? 'button--outline-warning' : 'button--secondary'}`}
                                    onClick={handleToggleStatus}
                                >
                                    <Icon name={rider.status === 'Active' ? 'userPause' : 'userCheck'} size={16} />
                                    {rider.status === 'Active' ? 'Deactivate' : 'Activate'}
                                </button>
                            </>
                        )}
                        {canEscalate && (
                            <button type="button" className="button button--outline-danger" onClick={() => setEscalating(true)}>
                                <Icon name="shield" size={16} />
                                {isTeamLeader ? 'Record escalation' : 'Escalate'}
                            </button>
                        )}
                        {canManage && (
                            <button type="button" className="button button--danger" onClick={() => setTerminating(true)}>
                                <Icon name="userX" size={16} />
                                Terminate
                            </button>
                        )}
                    </>
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
                    {activePromise && (
                        <p className="promise-banner" role="status">
                            Promised to pay
                            {activePromise.promiseAmount !== null && <> <CurrencyText value={activePromise.promiseAmount} /></>}
                            {' by '}<strong>{formatDate(activePromise.promiseDate)}</strong>
                            {' — logged by '}{activePromise.loggedBy}
                        </p>
                    )}

                    {paymentClaim && (
                        <p className="promise-banner" role="status">
                            {paymentClaim.loggedBy} says the rider paid ({formatDate(paymentClaim.loggedAt)}): “{paymentClaim.note}”.{' '}
                            {isAdmin
                                ? 'Check the money arrived, then use Mark as paid on the Payment Due (raise one first if there is none).'
                                : 'Still owed until an admin confirms the payment.'}
                        </p>
                    )}

                    {openEscalations.length > 0 && tab !== 'escalations' && (
                        <p className="escalation-banner" role="status">
                            {openEscalations.length === 1 ? '1 open escalation' : `${openEscalations.length} open escalations`}
                            {' — '}
                            <button type="button" className="button button--link" onClick={() => openTab('escalations')}>
                                View escalations
                            </button>
                        </p>
                    )}

                    <StatusTabs variant="segmented" label="Rider sections" tabs={tabs} value={tab} onChange={openTab} />

                    {tab === 'overview' && (
                        <>
                            <RiderOverview
                                profile={profile.data}
                                showStaffLinks={!isTeamLeader}
                                onEdit={canManage ? () => setEditing(true) : undefined}
                            />
                            {!isTeamLeader && <TeamLeadersPanel rider={rider} isAdmin={isAdmin} />}
                        </>
                    )}
                    {tab === 'earnings' && <RiderEarningsTab riderId={riderId} />}
                    {tab === 'history' && <RiderHistoryTab riderId={riderId} />}
                    {tab === 'escalations' && (
                        <RiderEscalationsTab riderId={riderId} reloadKey={reloadKey} onChanged={reload} />
                    )}
                    {tab === 'follow-ups' && <RiderFollowUpsTab riderId={riderId} reloadKey={reloadKey} />}
                    {tab === 'onboarding' && <RiderOnboardingTab application={profile.data.application} reloadKey={refreshKey} />}
                    {tab === 'documents' && <RiderDocumentsTab application={profile.data.application} reloadKey={refreshKey} />}
                </>
            )}

            {escalating && profile.data && (
                <EscalateDialog
                    rider={rider}
                    outstandingBalance={profile.data.outstandingBalance}
                    recordOnly={isTeamLeader}
                    activePromise={activePromise}
                    onSubmit={handleEscalate}
                    onClose={() => setEscalating(false)}
                />
            )}

            {loggingFollowUp && profile.data && (
                <FollowUpDialog
                    rider={rider}
                    outstandingBalance={profile.data.outstandingBalance}
                    openEscalations={openEscalations}
                    onSubmit={handleLogFollowUp}
                    onClose={() => setLoggingFollowUp(false)}
                />
            )}

            {editing && riderRow && (
                <RiderFormDialog rider={riderRow} onSubmit={handleSave} onClose={() => setEditing(false)} />
            )}

            {showingInactiveDays && riderRow && (
                <InactivePeriodsPanel
                    rider={riderRow}
                    onClose={() => {
                        setShowingInactiveDays(false);
                        // Approved inactive days change this week's rental, so reload the bill.
                        reload();
                    }}
                />
            )}

            <TerminateRiderDialog
                rider={terminating ? riderRow : null}
                onTerminated={() => {
                    setTerminating(false);
                    reload();
                }}
                onCancel={() => setTerminating(false)}
            />
        </>
    );
}
