import { Link } from 'react-router-dom';

import EmptyState from '../../../components/feedback/EmptyState';
import CurrencyText from '../../../components/ui/CurrencyText';

// Riders whose deductions were more than their earnings in the latest week, so they owe money.
export default function CollectionsPanel({ latest, riders }) {
    return (
        <section className="card panel">
            <div className="panel__header">
                <h3 className="panel__title">Riders owing money</h3>
                <span className="panel__meta">Week of {latest.label}</span>
            </div>

            <div className="mini-stats">
                <div>
                    <span className="mini-stats__label">Riders</span>
                    <strong>{latest.owingCount}</strong>
                </div>
                <div>
                    <span className="mini-stats__label">Total owed</span>
                    <strong><CurrencyText value={latest.owedAmount} /></strong>
                </div>
            </div>

            {riders.length === 0 ? (
                <EmptyState message="No rider has a negative net payout this week." />
            ) : (
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Rider</th>
                                <th className="num">Earnings</th>
                                <th className="num">Deductions</th>
                                <th className="num">Net</th>
                            </tr>
                        </thead>
                        <tbody>
                            {riders.map(rider => (
                                <tr key={rider.riderId}>
                                    <td><Link to={`/riders/${encodeURIComponent(rider.riderId)}`}>{rider.riderId}</Link></td>
                                    <td className="num"><CurrencyText value={rider.earnings} /></td>
                                    <td className="num"><CurrencyText value={rider.totalAmount} /></td>
                                    <td className="num"><CurrencyText value={rider.netPayout} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
