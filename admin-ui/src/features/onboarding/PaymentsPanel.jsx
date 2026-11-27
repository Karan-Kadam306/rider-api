import CurrencyText from '../../components/ui/CurrencyText';
import Icon from '../../components/ui/Icon';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatDateTime } from '../../utils/week';
import { PAYMENT_LABELS } from './reviewLabels';

// What the rider pays after approval (the deposit, and a prepaid rider's first pack), every attempt,
// and the deposit we hold. onMarkPaid(purpose) is passed only for admins while payment is pending.
export default function PaymentsPanel({ payments, onMarkPaid }) {
    const { items, orders, deposit } = payments;

    return (
        <section className="card panel">
            <div className="panel__header">
                <h3 className="panel__title">Payments</h3>
                <span className="panel__meta">Amounts are set by the server</span>
            </div>

            <ul className="review-checklist">
                {items.map(item => (
                    <li key={item.purpose} className="review-checklist__item">
                        <div>
                            <div className="person__name">
                                {PAYMENT_LABELS[item.purpose]} <StatusBadge status={item.status} />
                            </div>
                            <div className="cell-sub">
                                {item.amount === null ? 'No deposit amount set' : <CurrencyText value={item.amount} />}
                                {item.paidAt && <> · paid {formatDateTime(item.paidAt)}</>}
                                {item.openOrder && <> · payment open until {formatDateTime(item.openOrder.expiresAt)}</>}
                            </div>
                        </div>
                        {onMarkPaid && item.status === 'Due' && (
                            <div className="row-actions">
                                <button type="button" className="pill-button" onClick={() => onMarkPaid(item.purpose)}>
                                    <Icon name="circleCheck" size={15} />
                                    Mark paid
                                </button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>

            {deposit && (
                <p className="cell-sub">
                    Deposit <CurrencyText value={deposit.amount} /> {deposit.status.toLowerCase()} since {formatDateTime(deposit.heldSince)}
                    {deposit.reference && <> · ref <span className="mono">{deposit.reference}</span></>}
                </p>
            )}

            {orders.length > 0 && (
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Started</th>
                                <th>For</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Reference</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...orders].reverse().map(order => (
                                <tr key={order.orderId}>
                                    <td className="muted">{formatDateTime(order.createdAt)}</td>
                                    <td>{PAYMENT_LABELS[order.purpose]}</td>
                                    <td><CurrencyText value={order.amount} /></td>
                                    <td>
                                        <StatusBadge status={order.status} />
                                        {order.failureReason && <div className="cell-sub">{order.failureReason}</div>}
                                    </td>
                                    <td>
                                        {order.reference ? <span className="mono">{order.reference}</span> : <span className="muted">—</span>}
                                        {order.method === 'Manual' && (
                                            <div className="cell-sub">
                                                Marked paid by {order.markedBy}
                                                {order.note && <> · “{order.note}”</>}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
