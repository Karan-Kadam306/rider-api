import { useEffect, useRef, useState } from 'react';

import { getBikeHistory } from '../../api/bikesApi';
import { useApi } from '../../hooks/useApi';
import Icon from '../../components/ui/Icon';
import Pagination from '../../components/ui/Pagination';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import { formatDateTime } from '../../utils/formatDate';

const PAGE_SIZE = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

// Whole days held, rounded down.
function formatDuration(assignedAt, returnedAt) {
    const days = Math.floor((new Date(returnedAt ?? Date.now()) - new Date(assignedAt)) / DAY_MS);

    if (days < 1) {
        return 'Under a day';
    }

    return days === 1 ? '1 day' : `${days} days`;
}

// Side panel listing every rider who has held this bike, newest first. Mounted only while open.
export default function BikeHistoryPanel({ bike, onClose }) {
    const dialogRef = useRef(null);
    const [page, setPage] = useState(1);

    const history = useApi(
        options => getBikeHistory(bike.bikeId, { page, limit: PAGE_SIZE }, options),
        [bike.bikeId, page]
    );

    useEffect(() => {
        dialogRef.current.showModal();
    }, []);

    function handleCancel(event) {
        // Escape key: close through the parent, which unmounts this panel.
        event.preventDefault();
        onClose();
    }

    return (
        <dialog ref={dialogRef} className="drawer" onCancel={handleCancel} aria-labelledby="bike-history-title">
            <div className="drawer__header">
                <div>
                    <h3 id="bike-history-title" className="dialog__title">Assignment history</h3>
                    <p className="cell-sub">
                        {bike.registrationNumber ? `${bike.registrationNumber} · ${bike.chassisNumber}` : bike.chassisNumber}
                    </p>
                </div>
                <button type="button" className="button button--icon" aria-label="Close" onClick={onClose}>
                    <Icon name="close" size={16} />
                </button>
            </div>

            <div className="drawer__body">
                {history.loading && <p className="muted">Loading history…</p>}

                {history.error && <ErrorState title="Could not load history" error={history.error} onRetry={history.retry} />}

                {history.data && !history.data.history.length && (
                    <EmptyState message="This bike has never been assigned." />
                )}

                {history.data?.history.length > 0 && (
                    <ol className="timeline">
                        {history.data.history.map(entry => (
                            <li key={entry.assignmentId} className="timeline__item">
                                <div className="timeline__top">
                                    <span className="person__name">{entry.riderName}</span>
                                    {entry.returnedAt
                                        ? <span className="cell-sub">{formatDuration(entry.assignedAt, entry.returnedAt)}</span>
                                        : <span className="badge badge--info">Current</span>}
                                </div>
                                <div className="cell-sub">{entry.riderId}</div>
                                <div className="cell-sub">
                                    {formatDateTime(entry.assignedAt)} → {entry.returnedAt ? formatDateTime(entry.returnedAt) : 'now'}
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </div>

            {history.data && (
                <Pagination {...history.data.pagination} onPageChange={setPage} />
            )}
        </dialog>
    );
}
