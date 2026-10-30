import EmptyState from '../../../components/feedback/EmptyState';
import CurrencyText from '../../../components/ui/CurrencyText';
import StatusBadge from '../../../components/ui/StatusBadge';
import { formatNumber } from '../../../utils/formatCurrency';

// Rows arrive sorted and limited to the top 5 by the backend.
export default function TopRidersTable({ rows }) {
    return (
        <section className="card panel">
            <h3 className="panel__title">Top riders this week</h3>

            {rows.length === 0 ? (
                <EmptyState />
            ) : (
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Rider</th>
                                <th>Status</th>
                                <th className="num">Rental days</th>
                                <th className="num">KM</th>
                                <th className="num">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => (
                                <tr key={row.riderId}>
                                    <td>{row.riderId}</td>
                                    <td><StatusBadge status={row.riderStatus} /></td>
                                    <td className="num">{row.rentalDays}</td>
                                    <td className="num">{formatNumber(row.totalKm)}</td>
                                    <td className="num"><CurrencyText value={row.totalAmount} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
