import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
    approveApplication,
    getApplication,
    holdApplication,
    rejectApplication,
    releaseApplication,
    requestChanges,
    reviewItem
} from '../api/onboardingApi';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useWeek } from '../context/WeekContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/layout/PageHeader';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import Icon from '../components/ui/Icon';
import StatusBadge from '../components/ui/StatusBadge';
import { formatDate } from '../utils/formatDate';
import { formatDateTime } from '../utils/week';
import { REVIEW_ITEMS, STEP_LABELS } from '../features/onboarding/reviewLabels';
import DocumentViewer from '../features/onboarding/DocumentViewer';
import ChecksPanel from '../features/onboarding/ChecksPanel';
import TimelinePanel from '../features/onboarding/TimelinePanel';
import ReasonDialog from '../features/onboarding/ReasonDialog';
import RequestChangesDialog from '../features/onboarding/RequestChangesDialog';
import ApproveDialog from '../features/onboarding/ApproveDialog';

// Waiting on the reviewer: these can be approved, held or sent back. Same rules as the API.
const IN_REVIEW = ['Pending Review', 'Resubmitted'];
const ITEMS_OPEN = [...IN_REVIEW, 'On Hold'];
const REJECTABLE = [...ITEMS_OPEN, 'Changes Requested'];

const ITEM_LABELS = Object.fromEntries(REVIEW_ITEMS.map(({ item, label }) => [item, label]));

function itemDetails(application, item) {
    if (item === 'bank') {
        const { bank } = application;
        return bank && `A/c ••${bank.accountLast4} · ${bank.ifsc} · ${bank.holderName}`;
    }

    const document = application.documents[item];

    if (!document) {
        return null;
    }

    return [
        document.numberLast4 && `••${document.numberLast4}`,
        document.expiryDate && `valid till ${formatDate(document.expiryDate)}`,
        document.version > 1 && `upload ${document.version}`
    ].filter(Boolean).join(' · ');
}

// One application, reviewed item by item with the documents in view, then approved, sent back,
// held or rejected. Opened from the onboarding tabs of Rider Management.
export default function ApplicationReviewPage() {
    const { applicationId } = useParams();
    const { isOnboarding } = useAuth();
    const { refreshKey } = useWeek();
    const showToast = useToast();

    const query = useApi(options => getApplication(applicationId, options), [applicationId, refreshKey]);
    // The application an action returned; used until the page loads it again.
    const [updated, setUpdated] = useState(null);
    const application = updated?.base === query.data ? updated.value : query.data;

    const [viewing, setViewing] = useState(null);
    // Which dialog is open: 'reject-item', 'hold', 'reject', 'changes' or 'approve'.
    const [dialog, setDialog] = useState(null);
    const [rejectingItem, setRejectingItem] = useState(null);
    const [busyItem, setBusyItem] = useState(null);

    const show = value => setUpdated({ base: query.data, value });
    const closeDialog = () => setDialog(null);

    async function verify(item) {
        setBusyItem(item);

        try {
            show(await reviewItem(application.applicationId, item, { status: 'Verified' }));
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        } finally {
            setBusyItem(null);
        }
    }

    // Dialog actions: errors reject back to the dialog, which shows them.
    async function rejectItem(reason) {
        show(await reviewItem(application.applicationId, rejectingItem, { status: 'Rejected', reason }));
        closeDialog();
    }

    async function hold(reason) {
        show(await holdApplication(application.applicationId, reason));
        showToast({ message: 'Application put on hold' });
        closeDialog();
    }

    async function reject(reason) {
        show(await rejectApplication(application.applicationId, reason));
        showToast({ message: 'Application rejected' });
        closeDialog();
    }

    async function sendBack(body) {
        show(await requestChanges(application.applicationId, body));
        showToast({ message: 'Sent back to the rider' });
        closeDialog();
    }

    async function approve(body) {
        const approved = await approveApplication(application.applicationId, body);
        show(approved);
        showToast({ message: `Approved as rider ${approved.riderId}` });
        closeDialog();
    }

    async function release() {
        try {
            show(await releaseApplication(application.applicationId));
            showToast({ message: 'Released from hold' });
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        }
    }

    const name = application && `${application.profile.firstName} ${application.profile.surname}`;
    const status = application?.status;
    const itemsOpen = ITEMS_OPEN.includes(status);
    const reviewStatusOf = item => (item === 'bank' ? application.bank : application.documents[item])?.reviewStatus;
    const allVerified = application && REVIEW_ITEMS.every(({ item }) => reviewStatusOf(item) === 'Verified');
    const rejectedSteps = application
        ? REVIEW_ITEMS.filter(({ item }) => reviewStatusOf(item) === 'Rejected').map(({ step }) => step)
        : [];
    const backTo = { label: 'Rider Management', to: '/riders?tab=review' };

    return (
        <>
            <PageHeader
                variant="detail"
                breadcrumbs={[backTo, { label: application?.applicationNo ?? 'Application' }]}
                title={
                    <span className="rider-title">
                        <Link to={backTo.to} className="button button--icon" aria-label="Back to Rider Management">
                            <Icon name="chevronLeft" size={18} />
                        </Link>
                        {name ?? 'Application'}
                        {application && <StatusBadge status={status} />}
                        {application?.isTest && <span className="badge badge--warning">Test</span>}
                    </span>
                }
                subtitle={application && (
                    <span className="mono">
                        {application.applicationNo} · {application.phone}
                        {application.riderId && <> · {isOnboarding
                            ? application.riderId
                            : <Link to={`/riders/${encodeURIComponent(application.riderId)}`}>{application.riderId}</Link>}</>}
                    </span>
                )}
                actions={application && (
                    <>
                        {IN_REVIEW.includes(status) && (
                            <>
                                <button
                                    type="button"
                                    className="button"
                                    disabled={!allVerified}
                                    title={allVerified ? undefined : 'Verify every item first'}
                                    onClick={() => setDialog('approve')}
                                >
                                    <Icon name="circleCheck" size={16} />
                                    Approve
                                </button>
                                <button type="button" className="button button--secondary" onClick={() => setDialog('changes')}>
                                    <Icon name="undo" size={16} />
                                    Send back
                                </button>
                                <button type="button" className="button button--outline-warning" onClick={() => setDialog('hold')}>
                                    <Icon name="clock" size={16} />
                                    Hold
                                </button>
                            </>
                        )}
                        {status === 'On Hold' && (
                            <button type="button" className="button button--secondary" onClick={release}>
                                <Icon name="refresh" size={16} />
                                Release
                            </button>
                        )}
                        {REJECTABLE.includes(status) && (
                            <button type="button" className="button button--danger" onClick={() => setDialog('reject')}>
                                <Icon name="userX" size={16} />
                                Reject
                            </button>
                        )}
                    </>
                )}
            />

            {query.loading && <LoadingSkeleton variant="table" rows={6} />}

            {query.error && (
                <ErrorState
                    title={query.error.status === 404 ? 'Application not found' : 'Could not load this application'}
                    error={query.error}
                    onRetry={query.error.status === 404 ? undefined : query.retry}
                />
            )}

            {application && (
                <>
                    {application.holdReason && (
                        <p className="promise-banner" role="status">On hold: {application.holdReason}</p>
                    )}
                    {application.rejectReason && (
                        <p className="promise-banner" role="status">Rejected: {application.rejectReason}</p>
                    )}
                    {status === 'Changes Requested' && (
                        <p className="promise-banner" role="status">
                            Waiting for the rider to fix: {application.fixSteps.map(step => STEP_LABELS[step]).join(', ')}
                            {application.changeNote && <> — “{application.changeNote}”</>}
                        </p>
                    )}

                    <div className="widget-grid">
                        <section className="card panel">
                            <div className="panel__header">
                                <h3 className="panel__title">Checklist</h3>
                                <span className="panel__meta">Verify every item to approve</span>
                            </div>
                            <ul className="review-checklist">
                                {REVIEW_ITEMS.map(({ item, label }) => {
                                    const reviewed = item === 'bank' ? application.bank : application.documents[item];
                                    const files = application.documents[item]?.files ?? [];

                                    return (
                                        <li key={item} className="review-checklist__item">
                                            <div>
                                                <div className="person__name">
                                                    {label} {reviewed && <StatusBadge status={reviewed.reviewStatus} />}
                                                </div>
                                                <div className="cell-sub mono">{itemDetails(application, item) ?? 'Not uploaded'}</div>
                                                {reviewed?.reviewReason && <div className="cell-sub">“{reviewed.reviewReason}”</div>}
                                                {reviewed?.reviewedBy && (
                                                    <div className="cell-sub">{reviewed.reviewedBy} · {formatDateTime(reviewed.reviewedAt)}</div>
                                                )}
                                            </div>
                                            <div className="row-actions">
                                                {files.map(file => (
                                                    <button
                                                        key={file.fileId}
                                                        type="button"
                                                        className="pill-button"
                                                        onClick={() => setViewing({ file, title: label })}
                                                    >
                                                        <Icon name="file" size={15} />
                                                        {file.side === 'single' ? 'View' : file.side}
                                                    </button>
                                                ))}
                                                {itemsOpen && reviewed && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="pill-button"
                                                            disabled={busyItem === item || reviewed.reviewStatus === 'Verified'}
                                                            onClick={() => verify(item)}
                                                        >
                                                            <Icon name="circleCheck" size={15} />
                                                            Verify
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="pill-button pill-button--danger"
                                                            disabled={busyItem === item}
                                                            onClick={() => {
                                                                setRejectingItem(item);
                                                                setDialog('reject-item');
                                                            }}
                                                        >
                                                            <Icon name="close" size={15} />
                                                            Reject
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>

                        <ApplicantPanel application={application} name={name} />
                    </div>

                    <div className="widget-grid">
                        <ChecksPanel application={application} name={name} />
                        <TimelinePanel timeline={application.timeline} />
                    </div>
                </>
            )}

            {viewing && (
                <DocumentViewer
                    applicationId={application.applicationId}
                    file={viewing.file}
                    title={viewing.title}
                    onClose={() => setViewing(null)}
                />
            )}

            {dialog === 'reject-item' && (
                <ReasonDialog
                    title={`Reject ${ITEM_LABELS[rejectingItem]}`}
                    hint="The rider sees this reason when the step is sent back."
                    placeholder="e.g. The photo is blurred, the number cannot be read"
                    confirmLabel="Reject item"
                    onSubmit={rejectItem}
                    onClose={closeDialog}
                />
            )}
            {dialog === 'hold' && (
                <ReasonDialog
                    title="Put on hold"
                    hint="The rider sees this reason in the app. Release the application to carry on reviewing."
                    placeholder="e.g. Waiting for police verification"
                    confirmLabel="Hold"
                    onSubmit={hold}
                    onClose={closeDialog}
                />
            )}
            {dialog === 'reject' && (
                <ReasonDialog
                    title={`Reject ${name}?`}
                    details="This is final. The rider can apply again after 30 days."
                    hint="The rider sees this reason in the app."
                    placeholder="e.g. Licence is not valid for this vehicle"
                    confirmLabel="Reject application"
                    onSubmit={reject}
                    onClose={closeDialog}
                />
            )}
            {dialog === 'changes' && (
                <RequestChangesDialog lockedSteps={rejectedSteps} onSubmit={sendBack} onClose={closeDialog} />
            )}
            {dialog === 'approve' && (
                <ApproveDialog application={application} onSubmit={approve} onClose={closeDialog} />
            )}
        </>
    );
}

function ApplicantPanel({ application, name }) {
    const { profile, plan, policy } = application;

    return (
        <section className="card panel">
            <div className="panel__header">
                <h3 className="panel__title">Applicant</h3>
                <span className="panel__meta">
                    {application.isReapplication ? 'Applied again' : 'First application'}
                </span>
            </div>
            <dl className="detail-list">
                <div>
                    <dt>Name</dt>
                    <dd>{name}</dd>
                </div>
                <div>
                    <dt>Date of birth</dt>
                    <dd>{formatDate(profile.dateOfBirth)}</dd>
                </div>
                {profile.address && (
                    <div>
                        <dt>Address</dt>
                        <dd>
                            {[profile.address.addressLine1, profile.address.addressLine2, profile.address.city, profile.address.state, profile.address.pincode]
                                .filter(Boolean)
                                .join(', ')}
                            <div className="cell-sub">Proof: {profile.address.addressProofKind}</div>
                        </dd>
                    </div>
                )}
                {profile.emergencyContact && (
                    <div>
                        <dt>Emergency contact</dt>
                        <dd>
                            {profile.emergencyContact.name} ({profile.emergencyContact.relation})
                            <span className="mono"> {profile.emergencyContact.phone}</span>
                        </dd>
                    </div>
                )}
                <div>
                    <dt>Plan</dt>
                    <dd>{plan.planType ?? '—'}{plan.pack && ` · ${plan.pack.name}`}</dd>
                </div>
                {policy && (
                    <div>
                        <dt>Policies</dt>
                        <dd>Version {policy.version}, accepted {formatDateTime(policy.acceptedAt)}</dd>
                    </div>
                )}
                {application.hub && (
                    <div>
                        <dt>Hub</dt>
                        <dd>{application.hub.name}</dd>
                    </div>
                )}
                <div>
                    <dt>Submitted</dt>
                    <dd>{application.submittedAt ? formatDateTime(application.submittedAt) : 'Not yet'}</dd>
                </div>
            </dl>
        </section>
    );
}
