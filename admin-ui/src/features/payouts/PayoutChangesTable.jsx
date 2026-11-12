import CurrencyText from '../../components/ui/CurrencyText';
import { formatNumber } from '../../utils/formatCurrency';

// What the next payout run will write: one row per rider whose amounts differ from what was deducted.
// change.paid is empty on a rider's first deduction, so there is no old value or difference to show.
export default function PayoutChangesTable({ changes }) {
    return (
        <div className="table-wrap">
            <table className="table table--roomy">
                <thead>
                    <tr>
                        <th>Rider</th>
                        <th className="num">Rental days</th>
                        <th className="num">KM</th>
                        <th className="num">Deducted</th>
                        <th className="num">New deduction</th>
                        <th className="num">Difference</th>
                        <th className="num">Earnings</th>
                        <th className="num">Net payout</th>
                    </tr>
                </thead>
                <tbody>
                    {changes.map(change => (
                        <tr key={change.riderId}>
                            <td>
                                <div className="person__name">{change.riderName ?? change.riderId}</div>
                                <div className="cell-sub">{change.riderId}</div>
                            </td>
                            <td className="num">
                                {change.paid && change.paid.rentalDays !== change.current.rentalDays && (
                                    <span className="muted">{change.paid.rentalDays} → </span>
                                )}
                                {change.current.rentalDays}
                            </td>
                            <td className="num">
                                {change.paid && change.paid.totalKm !== change.current.totalKm && (
                                    <span className="muted">{formatNumber(change.paid.totalKm)} → </span>
                                )}
                                {formatNumber(change.current.totalKm)}
                            </td>
                            <td className="num">
                                {change.paid ? <CurrencyText value={change.paid.totalAmount} /> : <span className="muted">—</span>}
                            </td>
                            <td className="num"><strong><CurrencyText value={change.current.totalAmount} /></strong></td>
                            <td className="num">
                                {change.paid ? <CurrencyText value={change.difference} showSign /> : <span className="muted">First payout</span>}
                            </td>
                            {/* Payouts from before partner earnings have none saved, so they count as ₹0. */}
                            <td className="num">
                                {change.paid && (change.paid.earnings ?? 0) !== change.current.earnings && (
                                    <span className="muted"><CurrencyText value={change.paid.earnings ?? 0} /> → </span>
                                )}
                                <CurrencyText value={change.current.earnings} />
                            </td>
                            {/* The old net is worked back from the difference, since old payouts have no net saved. */}
                            <td className="num">
                                {change.paid && change.netDifference !== 0 && (
                                    <span className="muted"><CurrencyText value={change.current.netPayout - change.netDifference} /> → </span>
                                )}
                                <strong><CurrencyText value={change.current.netPayout} /></strong>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
