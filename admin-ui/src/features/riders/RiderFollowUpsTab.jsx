import { useState } from 'react';

import { getFollowUps } from '../../api/followUpsApi';
import { useApi } from '../../hooks/useApi';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import LoadingSkeleton from '../../components/feedback/LoadingSkeleton';
import CurrencyText from '../../components/ui/CurrencyText';
import Pagination from '../../components/ui/Pagination';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatDate } from '../../utils/formatDate';
import { roleLabel } from '../../utils/roleLabel';
import { formatDateTime } from '../../utils/week';

const PAGE_SIZE = 20;

// Every call logged for the rider, newest first: who called, what the rider said, and any promise.
export default function RiderFollowUpsTab({ riderId, reloadKey }) {
    const [page, setPage] = useState(1);
    const list = useApi(
        options => getFollowUps(riderId, { page, limit: PAGE_SIZE }, options),
        [riderId, page, reloadKey]
    );

    if (list.loading) {
        return <LoadingSkeleton variant="table" rows={4} />;
    }

    if (list.error) {
        return <ErrorState title="Could not load follow-ups" error={list.error} onRetry={list.retry} />;
    }

    if (!list.data.followUps.length) {
        return (
            <section className="card">
                <EmptyState message="No follow-ups yet. Use Log follow-up after calling the rider." />
            </section>
        );
    }

    return (
        <section className="card panel">
            <ol className="timeline">
                {list.data.followUps.map(followUp => (
                    <li key={followUp.followUpId} className="timeline__item follow-up">
                        <div className="timeline__top">
                            <span className="follow-up__title">
                                {followUp.reason}
                                <StatusBadge status={followUp.outcome} />
                            </span>
                            <span className="cell-sub">{formatDateTime(followUp.createdAt)}</span>
                        </div>
                        <p className="follow-up__note">{followUp.note}</p>
                        {followUp.promiseDate && (
                            <p className="follow-up__promise">
                                Promised to pay
                                {followUp.promiseAmount !== null && <> <CurrencyText value={followUp.promiseAmount} /></>}
                                {' by '}<strong>{formatDate(followUp.promiseDate)}</strong>
                            </p>
                        )}
                        <div className="cell-sub">
                            {followUp.loggedBy.name} · {roleLabel(followUp.loggedBy.role)}
                            {followUp.escalationId && <> · about escalation #{followUp.escalationId}</>}
                        </div>
                    </li>
                ))}
            </ol>
            <Pagination {...list.data.pagination} onPageChange={setPage} />
        </section>
    );
}
