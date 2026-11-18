import WeeklyColumnChart from '../charts/WeeklyColumnChart';
import ChartTable from '../charts/ChartTable';
import KmHeatmap from '../charts/KmHeatmap';

// Km reported by the bikes, whatever their review status: weekly totals, then day by day.
export default function KmPanel({ weeks, truncated }) {
    const labels = weeks.map(week => week.label);
    const series = [{ key: 'km', label: 'Km run', color: 'var(--chart-km)', values: weeks.map(week => week.km) }];

    return (
        <>
            <section className="card panel">
                <div className="panel__header">
                    <h3 className="panel__title">Km run per week</h3>
                    <span className="panel__meta">From daily km uploads</span>
                </div>
                {truncated && (
                    <p className="panel__hint">Only the first 3,000 km records were loaded; choose a shorter range for full totals.</p>
                )}
                <WeeklyColumnChart labels={labels} series={series} format="km" label="Km run per week" />
                <ChartTable labels={labels} columns={series} format="km" />
            </section>

            <section className="card panel">
                <div className="panel__header">
                    <h3 className="panel__title">Daily km</h3>
                    <span className="panel__meta">All bikes, per day</span>
                </div>
                <KmHeatmap weeks={weeks} />
            </section>
        </>
    );
}
