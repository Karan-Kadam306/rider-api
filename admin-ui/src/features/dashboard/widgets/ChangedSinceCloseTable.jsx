import EmptyState from '../../../components/feedback/EmptyState';
import CurrencyText from '../../../components/ui/CurrencyText';

// Riders whose bill moved after the week closed. Billed amounts stay as they were, so corrections show here.
// currentAmount is null when the rider now needs review and has no calculable bill.
export default function ChangedSinceCloseTable({ rows, closed }) {
    return (
        <section className="card panel">
            <h3 className="panel__title">Changed since close</h3>

            {!closed ? (
                <EmptyState message="The week is still open, so there is nothing to compare yet." />
            ) : rows.length === 0 ? (
                <EmptyState message="No bills have changed since the week was closed." />
            ) : (
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Rider</th>
                                <th className="num">Billed</th>
                                <th className="num">Current</th>
                                <th className="num">Difference</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => (
                                <tr key={row.riderId}>
                                    <td>{row.riderId}</td>
                                    <td className="num"><CurrencyText value={row.billedAmount} /></td>
                                    <td className="num">
                                        {row.currentAmount === null ? 'Needs review' : <CurrencyText value={row.currentAmount} />}
                                    </td>
                                    <td className="num"><CurrencyText value={row.difference} showSign /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
