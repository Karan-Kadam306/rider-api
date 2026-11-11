import Icon from '../../components/ui/Icon';
import CurrencyText from '../../components/ui/CurrencyText';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatNumber } from '../../utils/formatCurrency';

// Amount deducted at payout; empty until the week's first payout. A pending note shows the
// net payout change the next payout run will apply, which may come from earnings alone.
function PayoutCell({ rider }) {
    if (!rider.payout) {
        return <span className="muted">—</span>;
    }

    return (
        <>
            <CurrencyText value={rider.payout.totalAmount} />
            {rider.payoutPending ? (
                <span className="payout-cell__note payout-cell__note--pending">
                    Pending net <CurrencyText value={rider.payoutNetDifference} showSign />
                </span>
            ) : rider.payout.updatedRunNumber > 1 && (
                <span className="payout-cell__note">Updated in run {rider.payout.updatedRunNumber}</span>
            )}
        </>
    );
}

// One row per rider for the week: deductions, partner earnings and net payout (earnings − deductions).
// A closed week adds the billed amount and difference. Riders that need review show the reason instead of amounts.
export default function BillsTable({ riders, closed, onView }) {
    // How many columns a Needs Review row's reason spans: all the amounts, plus Billed and Difference once closed.
    const amountColumns = closed ? 10 : 8;

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
                        <th className="num">Deductions</th>
                        <th className="num">Earnings</th>
                        <th className="num">Net payout</th>
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
                                    <td className="num"><CurrencyText value={rider.totalAmount} /></td>
                                    <td className="num"><CurrencyText value={rider.earnings} /></td>
                                    <td className="num">
                                        <strong><CurrencyText value={rider.netPayout} /></strong>
                                        {rider.previousBalance < 0 && (
                                            <div className="cell-sub">incl. <CurrencyText value={rider.previousBalance} /> last week</div>
                                        )}
                                    </td>
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
