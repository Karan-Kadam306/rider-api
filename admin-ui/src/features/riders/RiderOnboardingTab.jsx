import { Link } from 'react-router-dom';

import { getApplication } from '../../api/onboardingApi';
import { useApi } from '../../hooks/useApi';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import LoadingSkeleton from '../../components/feedback/LoadingSkeleton';
import CurrencyText from '../../components/ui/CurrencyText';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatDateTime } from '../../utils/week';
import ChecksPanel from '../onboarding/ChecksPanel';
import TimelinePanel from '../onboarding/TimelinePanel';

export const NO_APPLICATION_MESSAGE = 'This rider was added before the rider app, so there are no onboarding records.';

// How the rider joined through the app: the application, the checks at submit and the timeline.
// Read-only; the review itself lives on the application's page. Admins and staff only.
export default function RiderOnboardingTab({ application: link, reloadKey }) {
    const query = useApi(
        options => (link ? getApplication(link.applicationId, options) : Promise.resolve(null)),
        [link?.applicationId, reloadKey]
    );

    if (!link) {
        return (
            <section className="card">
                <EmptyState message={NO_APPLICATION_MESSAGE} />
            </section>
        );
    }

    if (query.loading) {
        return <LoadingSkeleton variant="table" rows={4} />;
    }

    if (query.error) {
        return <ErrorState title="Could not load the application" error={query.error} onRetry={query.retry} />;
    }

    const application = query.data;
    const { plan, policy } = application;
    const name = `${application.profile.firstName} ${application.profile.surname}`;
    const approved = application.timeline.findLast(event => event.event === 'approved');

    return (
        <>
            <div className="widget-grid">
                <section className="card panel">
                    <div className="panel__header">
                        <h3 className="panel__title">Application</h3>
                        <Link to={`/onboarding/${application.applicationId}`} className="button button--link">Open full review</Link>
                    </div>
                    <dl className="detail-list">
                        <div>
                            <dt>Application no.</dt>
                            <dd className="mono">
                                {application.applicationNo} <StatusBadge status={application.status} />
                            </dd>
                        </div>
                        <div>
                            <dt>Signed up</dt>
                            <dd>
                                {formatDateTime(application.createdAt)}
                                {application.isReapplication && <div className="cell-sub">Applied again after a rejection</div>}
                            </dd>
                        </div>
                        <div>
                            <dt>Submitted</dt>
                            <dd>{application.submittedAt ? formatDateTime(application.submittedAt) : '—'}</dd>
                        </div>
                        <div>
                            <dt>Approved</dt>
                            <dd>{approved ? `${formatDateTime(approved.at)} by ${approved.by}` : '—'}</dd>
                        </div>
                        <div>
                            <dt>Hub at approval</dt>
                            <dd>{application.hub?.name ?? '—'}</dd>
                        </div>
                        <div>
                            <dt>Plan chosen</dt>
                            <dd>
                                {plan.planType ?? '—'}
                                {plan.pack && <> · {plan.pack.name} (<CurrencyText value={plan.pack.price} />, {plan.pack.kmIncluded} km)</>}
                                {plan.depositAmount !== null && (
                                    <div className="cell-sub">Deposit <CurrencyText value={plan.depositAmount} /></div>
                                )}
                            </dd>
                        </div>
                        {policy && (
                            <div>
                                <dt>Policies</dt>
                                <dd>Version {policy.version}, accepted {formatDateTime(policy.acceptedAt)}</dd>
                            </div>
                        )}
                    </dl>
                </section>

                <ChecksPanel application={application} name={name} />
            </div>

            <TimelinePanel timeline={application.timeline} />
        </>
    );
}
