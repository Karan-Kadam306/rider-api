import { Link } from 'react-router-dom';

import StatusBadge from '../../../components/ui/StatusBadge';

const STATUSES = ['Pending', 'Needs Review', 'Validated'];

export default function DailyKmQueuePanel({ dailyKm }) {
    return (
        <section className="card panel">
            <div className="panel__header">
                <h3 className="panel__title">Daily KM queue</h3>
                <span className="panel__meta">{dailyKm.total} records this week</span>
            </div>

            <ul className="queue-list">
                {STATUSES.map(status => (
                    <li key={status}>
                        <StatusBadge status={status} />
                        <strong className="queue-list__count">{dailyKm[status]}</strong>
                        <Link to={`/daily-km?status=${encodeURIComponent(status)}`}>Open →</Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
