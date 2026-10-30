import { getStatusTone } from '../../utils/statusColors';

// e.g. Active 40 · Inactive 5 · Terminated 3
export default function StatusBreakdown({ counts, statuses }) {
    return (
        <ul className="status-breakdown">
            {statuses.map(status => (
                <li key={status} className="status-breakdown__item">
                    <span className={`dot dot--${getStatusTone(status)}`} aria-hidden="true" />
                    {status} <strong>{counts?.[status] ?? 0}</strong>
                </li>
            ))}
        </ul>
    );
}
