import { getStatusTone } from '../../../utils/statusColors';
import { formatNumber } from '../../../utils/formatCurrency';

// One whole split into its statuses, e.g. the fleet by bike status. Each part keeps its label and
// count in the legend, so status never reads by colour alone.
export default function SegmentedBar({ label, parts, total }) {
    const visible = parts.filter(part => part.value > 0);

    return (
        <div className="segmented">
            <div className="segmented__header">
                <span>{label}</span>
                <strong>{formatNumber(total)}</strong>
            </div>
            <div className="segmented__bar" role="img" aria-label={parts.map(part => `${part.label} ${part.value}`).join(', ')}>
                {visible.map(part => (
                    <span
                        key={part.label}
                        className={`segmented__part tone--${getStatusTone(part.label)}`}
                        style={{ flexGrow: part.value }}
                    />
                ))}
            </div>
            <ul className="segmented__legend">
                {parts.map(part => (
                    <li key={part.label}>
                        <span className={`segmented__dot tone--${getStatusTone(part.label)}`} />
                        {part.label}
                        <strong>{formatNumber(part.value)}</strong>
                        <span className="segmented__share">
                            {total ? `${Math.round((part.value / total) * 100)}%` : '—'}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
