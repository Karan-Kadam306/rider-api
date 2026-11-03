import Icon from '../../components/ui/Icon';
import CurrencyText from '../../components/ui/CurrencyText';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatNumber } from '../../utils/formatCurrency';

// Amount deducted at payout; empty until the week's first payout. A pending note shows a
// correction that the next payout run will apply.
function PayoutCell({ rider }) {
    if (!rider.payout) {
        return <span className="muted">—</span>;
    }

    return (
        <>
            <CurrencyText value={rider.payout.totalAmount} />
            {rider.payoutPending ? (
                <span className="payout-cell__note payout-cell__note--pending">
                    Pending <CurrencyText value={rider.totalAmount - rider.payout.totalAmount} showSign />
                </span>
            ) : rider.payout.updatedRunNumber > 1 && (
                <span className="payout-cell__note">Updated in run {rider.payout.updatedRunNumber}</span>
            )}
        </>
    );
}

// One row per rider for the week. A closed week adds the billed amount and difference.
// Riders that need review show the reason instead of amounts.
export default function BillsTable({ riders, closed, onView }) {
    const amountColumns = closed ? 8 : 6;

    return (
        <div className="table-wrap">
            <table className="table table--roomy">
                <thead>
                    <tr>
                        <th>Rider</th>
                        <th>Status</th>
                        <th className="num">Rental days</th>
                        <th className="num">Rental</th>
                        <th className="num">KM</th>
                        <th className="num">Energy</th>
                        <th className="num">Total</th>
                        {closed && <th className="num">Billed</th>}
                        {closed && <th className="num">Difference</th>}
                        <th className="num">Deducted</th>
                        <th className="actions-col">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {riders.map(rider => (
                        <tr key={rider.riderId}>
                            <td>
                                <div className="person__name">{rider.riderName ?? rider.riderId}</div>
                                <div className="cell-sub">{rider.riderId}</div>
                            </td>
                            <td>{rider.riderStatus && <StatusBadge status={rider.riderStatus} />}</td>

                            {rider.requiresReview ? (
                                <td colSpan={amountColumns}>
                                    <StatusBadge status="Needs Review" />
                                    <div className="cell-sub">{rider.reason}</div>
                                </td>
                            ) : (
                                <>
                                    <td className="num">{rider.rentalDays}</td>
                                    <td className="num"><CurrencyText value={rider.totalRental} /></td>
                                    <td className="num">{formatNumber(rider.totalKm)}</td>
                                    <td className="num"><CurrencyText value={rider.totalEnergyCharge} /></td>
                                    <td className="num"><strong><CurrencyText value={rider.totalAmount} /></strong></td>
                                    {closed && (
                                        <td className="num">
                                            {rider.billed ? <CurrencyText value={rider.billed.totalAmount} /> : <span className="muted">Not billed</span>}
                                        </td>
                                    )}
                                    {closed && (
                                        <td className="num">
                                            {rider.changedSinceClose ? <CurrencyText value={rider.difference} showSign /> : <span className="muted">—</span>}
                                        </td>
                                    )}
                                    <td className="num"><PayoutCell rider={rider} /></td>
                                </>
                            )}

                            <td className="actions-col">
                                {!rider.requiresReview && (
                                    <button type="button" className="pill-button" onClick={() => onView(rider)}>
                                        <Icon name="eye" size={15} />
                                        View bill
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
