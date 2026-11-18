import { Link } from 'react-router-dom';

import StatusBadge from '../../../components/ui/StatusBadge';
import { formatNumber } from '../../../utils/formatCurrency';

// How far the numbers above can be trusted: unchecked km, unmatched earnings, failed imports, open weeks.
export default function DataHealthPanel({ analytics, weekCount }) {
    const { imports, kmStatusCounts, latest, closedWeeks } = analytics;

    const rows = [
        {
            label: 'Km records needing review',
            value: kmStatusCounts['Needs Review'] ?? 0,
            status: kmStatusCounts['Needs Review'] ? 'Needs Review' : 'Validated',
            to: '/daily-km'
        },
        {
            label: 'Km records pending validation',
            value: kmStatusCounts.Pending ?? 0,
            status: kmStatusCounts.Pending ? 'Pending' : 'Validated',
            to: '/daily-km'
        },
        {
            label: 'Unmatched earnings (latest week)',
            value: latest.pendingEarningsCount ?? 0,
            status: latest.pendingEarningsCount ? 'Pending' : 'Completed',
            to: '/pending-earnings'
        },
        {
            label: 'Riders whose bill needs review (latest week)',
            value: latest.reviewCount,
            status: latest.reviewCount ? 'Needs Review' : 'Completed',
            to: '/billing'
        },
        {
            label: `Weeks closed (of ${weekCount})`,
            value: closedWeeks,
            status: closedWeeks === weekCount ? 'Closed' : 'Open',
            to: '/billing'
        }
    ];

    return (
        <section className="card panel">
            <div className="panel__header">
                <h3 className="panel__title">Data health</h3>
                <span className="panel__meta">
                    Import success {imports.successRate === null ? '—' : `${imports.successRate}%`}
                </span>
            </div>
            <ul className="health-list">
                {rows.map(row => (
                    <li key={row.label}>
                        <Link to={row.to}>{row.label}</Link>
                        <strong>{formatNumber(row.value)}</strong>
                        <StatusBadge status={row.status} />
                    </li>
                ))}
            </ul>
            <p className="panel__hint">
                {formatNumber(imports.failedImports)} failed and {formatNumber(imports.partialImports)} partial imports
                out of {formatNumber(imports.totalImports)} in total.
            </p>
        </section>
    );
}
