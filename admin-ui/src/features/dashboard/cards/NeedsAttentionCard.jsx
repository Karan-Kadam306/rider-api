import { Link } from 'react-router-dom';

import StatCard from '../../../components/ui/StatCard';

export default function NeedsAttentionCard({ attention }) {
    const items = [
        { label: 'Riders needing review', count: attention.ridersNeedingReview, to: '/billing' },
        { label: 'Daily KM needing review', count: attention.kmNeedsReview, to: '/daily-km?status=Needs Review' },
        { label: 'Pending Daily KM', count: attention.kmPending, to: '/daily-km?status=Pending' },
        { label: 'Changed since close', count: attention.changedSinceClose, to: '/billing' }
    ];

    const total = items.reduce((sum, item) => sum + item.count, 0);

    return (
        <StatCard
            label="Needs attention"
            value={total}
            subText={total === 0 ? 'All clear' : undefined}
        >
            <ul className="attention-list">
                {items.map(item => (
                    <li key={item.label} className={item.count > 0 ? 'attention-list__item--active' : undefined}>
                        <Link to={item.to}>{item.label}</Link>
                        <strong>{item.count}</strong>
                    </li>
                ))}
            </ul>
        </StatCard>
    );
}
