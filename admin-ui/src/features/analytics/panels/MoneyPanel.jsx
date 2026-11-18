import WeeklyColumnChart from '../charts/WeeklyColumnChart';
import ChartTable from '../charts/ChartTable';

// Earnings against deductions each week, with what was left for riders as a line on the same ₹ scale.
export default function MoneyPanel({ weeks }) {
    const labels = weeks.map(week => week.label);
    const series = [
        { key: 'earnings', label: 'Partner earnings', color: 'var(--chart-1)', values: weeks.map(week => week.earnings) },
        { key: 'deductions', label: 'Deductions', color: 'var(--chart-2)', values: weeks.map(week => week.deductions) }
    ];
    const line = { key: 'netPayout', label: 'Net payout', color: 'var(--chart-3)', values: weeks.map(week => week.netPayout) };

    return (
        <section className="card panel analytics__wide">
            <div className="panel__header">
                <h3 className="panel__title">Earnings, deductions and net payout</h3>
                <span className="panel__meta">Per billing week</span>
            </div>
            <WeeklyColumnChart
                labels={labels}
                series={series}
                line={line}
                format="inr"
                faded={weeks.map(week => !week.closed)}
                label="Weekly partner earnings and deductions as columns, net payout as a line"
            />
            <ChartTable labels={labels} columns={[...series, line]} format="inr" />
        </section>
    );
}
