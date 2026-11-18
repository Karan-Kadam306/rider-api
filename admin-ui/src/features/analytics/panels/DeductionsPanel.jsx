import WeeklyColumnChart from '../charts/WeeklyColumnChart';
import ChartTable from '../charts/ChartTable';

// What the deductions are made of: flat rental days against energy charged per km.
export default function DeductionsPanel({ weeks }) {
    const labels = weeks.map(week => week.label);
    const series = [
        { key: 'rental', label: 'Rental', color: 'var(--chart-4)', values: weeks.map(week => week.rental) },
        { key: 'energy', label: 'Energy', color: 'var(--chart-5)', values: weeks.map(week => week.energy) }
    ];

    return (
        <section className="card panel">
            <div className="panel__header">
                <h3 className="panel__title">Deductions split</h3>
                <span className="panel__meta">Rental + energy</span>
            </div>
            <WeeklyColumnChart
                labels={labels}
                series={series}
                stacked
                format="inr"
                faded={weeks.map(week => !week.closed)}
                label="Weekly deductions stacked by rental and energy"
            />
            <ChartTable labels={labels} columns={series} format="inr" />
        </section>
    );
}
