import { Link } from 'react-router-dom';

import { getMyQueue } from '../api/teamLeadersApi';
import { useApi } from '../hooks/useApi';
import { useWeek } from '../context/WeekContext';
import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import CurrencyText from '../components/ui/CurrencyText';
import Icon from '../components/ui/Icon';
import StatusBadge from '../components/ui/StatusBadge';
import { formatDate, formatRelativeTime } from '../utils/formatDate';

// A team leader's home page: their riders who need a call now, worst first. The API decides who
// is listed (broken promise, open charge, money owed, lowest km); this page only shows it.
export default function QueuePage() {
    const { refreshKey } = useWeek();
    const queue = useApi(options => getMyQueue(options), [refreshKey]);

    return (
        <>
            <PageHeader
                title="Critical Queue"
                subtitle="Riders who need a call now. Log a follow-up from the rider's page after each call."
            />

            {queue.loading && <LoadingSkeleton variant="table" rows={6} />}

            {queue.error && <ErrorState title="Could not load your queue" error={queue.error} onRetry={queue.retry} />}

            {queue.data && (
                <section className="card card--flush">
                    {queue.data.riders.length ? (
                        <div className="table-wrap">
                            <table className="table table--roomy">
                                <thead>
                                    <tr>
                                        <th>Priority</th>
                                        <th>Rider</th>
                                        <th>Why</th>
                                        <th>Last follow-up</th>
                                        <th className="actions-col">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {queue.data.riders.map(rider => (
                                        <tr key={rider.riderId}>
                                            <td><StatusBadge status={rider.severity} /></td>
                                            <td>
                                                <span className="person__name">{rider.name}</span>
                                                <span className="person__sub mono">
                                                    {rider.riderId} · <a href={`tel:${rider.phone}`}>{rider.phone}</a>
                                                </span>
                                            </td>
                                            <td>
                                                <ul className="queue-reasons">
                                                    {rider.reasons.map(reason => <li key={reason.type}>{reason.label}</li>)}
                                                </ul>
                                                {rider.activePromise && (
                                                    <span className="person__sub">
                                                        Promised
                                                        {rider.activePromise.promiseAmount !== null && (
                                                            <> <CurrencyText value={rider.activePromise.promiseAmount} /></>
                                                        )}
                                                        {' by '}{formatDate(rider.activePromise.promiseDate)}
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <span className={rider.lastFollowUpAt ? '' : 'muted'}>
                                                    {rider.lastFollowUpAt ? formatRelativeTime(rider.lastFollowUpAt) : 'Never'}
                                                </span>
                                                {rider.followUpDue && <span className="person__sub"><StatusBadge status="Call due" /></span>}
                                            </td>
                                            <td className="actions-col">
                                                <div className="row-actions">
                                                    <Link
                                                        to={`/riders/${encodeURIComponent(rider.riderId)}?tab=follow-ups`}
                                                        className="pill-button"
                                                    >
                                                        <Icon name="eye" size={15} />
                                                        Open
                                                    </Link>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="card__empty">
                            <EmptyState message="Nothing needs a call right now." />
                        </div>
                    )}
                </section>
            )}
        </>
    );
}
