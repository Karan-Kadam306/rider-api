import StatCard from '../../components/ui/StatCard';
import Sparkline from './charts/Sparkline';
import { formatCompact, formatMetric } from './formatMetric';

const percent = new Intl.NumberFormat('en-IN', { style: 'percent', maximumFractionDigits: 1 });

// Arrow and sign carry the direction; colour only says whether that direction is good.
function Delta({ change, upIsGood }) {
    if (change === null || !Number.isFinite(change)) {
        return <span className="delta">No previous week</span>;
    }

    const up = change > 0;
    let tone = 'neutral';

    if (change !== 0 && upIsGood !== null) {
        tone = up === upIsGood ? 'good' : 'bad';
    }

    return (
        <span className={`delta delta--${tone}`}>
            {change === 0 ? '■' : up ? '▲' : '▼'} {percent.format(Math.abs(change))}
            <span className="delta__period"> vs previous week</span>
        </span>
    );
}

// Range total (or the latest week, as totalNote says), change against last week and a weekly trend.
export default function KpiTile({ kpi, weekCount }) {
    return (
        <StatCard
            label={kpi.label}
            value={<span title={formatMetric(kpi.total, kpi.format)}>{formatCompact(kpi.total, kpi.format)}</span>}
            subText={kpi.totalNote ?? `Last ${weekCount} weeks`}
        >
            <Delta change={kpi.change} upIsGood={kpi.upIsGood} />
            <Sparkline values={kpi.values} />
        </StatCard>
    );
}
