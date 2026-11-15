import { useState } from 'react';

import { getRiderAssignments } from '../../api/ridersApi';
import { useApi } from '../../hooks/useApi';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import LoadingSkeleton from '../../components/feedback/LoadingSkeleton';
import Pagination from '../../components/ui/Pagination';
import StatusBadge from '../../components/ui/StatusBadge';
import { bikeLabel } from '../../utils/bikeLabel';
import { formatDateTime } from '../../utils/week';

const PAGE_SIZE = 10;

// The History tab: every bike the rider has held, newest first.
export default function RiderHistoryTab({ riderId }) {
    const [page, setPage] = useState(1);
    const list = useApi(options => getRiderAssignments(riderId, { page, limit: PAGE_SIZE }, options), [riderId, page]);

    if (list.loading) {
        return <LoadingSkeleton variant="table" rows={5} />;
    }

    if (list.error) {
        return <ErrorState title="Could not load bike history" error={list.error} onRetry={list.retry} />;
    }

    return (
        <section className="card card--flush">
            {list.data.assignments.length ? (
                <>
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Bike</th>
                                    <th>Assigned</th>
                                    <th>Returned</th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.data.assignments.map(assignment => (
                                    <tr key={assignment.assignmentId}>
                                        <td className="mono">{bikeLabel(assignment)}</td>
                                        <td className="nowrap">{formatDateTime(assignment.assignedAt)}</td>
                                        <td className="nowrap">
                                            {assignment.returnedAt
                                                ? formatDateTime(assignment.returnedAt)
                                                : <StatusBadge status="Assigned" />}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination {...list.data.pagination} onPageChange={setPage} />
                </>
            ) : (
                <div className="card__empty">
                    <EmptyState message="This rider has not held a bike yet." />
                </div>
            )}
        </section>
    );
}
