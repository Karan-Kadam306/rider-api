import { formatMetric } from '../formatMetric';

// The chart's numbers as a table, closed by default. Light series colours sit below 3:1 on the
// light theme, so every value must also be readable here.
export default function ChartTable({ labels, columns, format }) {
    return (
        <details className="chart-table">
            <summary>View as table</summary>
            <div className="table-wrap">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Week</th>
                            {columns.map(column => (
                                <th key={column.key} className="num">{column.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {labels.map((weekLabel, index) => (
                            <tr key={weekLabel}>
                                <td>{weekLabel}</td>
                                {columns.map(column => (
                                    <td key={column.key} className="num">{formatMetric(column.values[index], format)}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </details>
    );
}
