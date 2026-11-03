import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import { getRiderBill } from '../../api/billingApi';
import { useApi } from '../../hooks/useApi';
import Icon from '../../components/ui/Icon';
import CurrencyText from '../../components/ui/CurrencyText';
import StatusBadge from '../../components/ui/StatusBadge';
import ErrorState from '../../components/feedback/ErrorState';
import { formatNumber } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import { addDays, formatDateTime, formatWeekRange } from '../../utils/week';

// Side panel with one rider's weekly bill: rental, each Daily KM record and, for a closed week,
// the billed amount. Mounted only while open.
export default function RiderBillPanel({ rider, weekStart, onClose }) {
    const dialogRef = useRef(null);
    const details = useApi(options => getRiderBill(rider.riderId, weekStart, options), [rider.riderId, weekStart]);

    useEffect(() => {
        dialogRef.current.showModal();
    }, []);

    function handleCancel(event) {
        event.preventDefault();
        onClose();
    }

    const bill = details.data;
    const records = bill?.energy.details ?? [];
    const chargedKm = records.filter(record => record.eligible).reduce((sum, record) => sum + record.dailyKm, 0);

    return (
        <dialog ref={dialogRef} className="drawer drawer--wide" onCancel={handleCancel} aria-labelledby="rider-bill-title">
            <div className="drawer__header">
                <div>
                    <h3 id="rider-bill-title" className="dialog__title">{rider.riderName ?? rider.riderId}</h3>
                    <p className="cell-sub">{rider.riderId} · {formatWeekRange(weekStart)}</p>
                </div>
                <button type="button" className="button button--icon" aria-label="Close" onClick={onClose}>
                    <Icon name="close" size={16} />
                </button>
            </div>

            <div className="drawer__body">
                {details.loading && <p className="muted">Loading bill…</p>}

                {details.error && <ErrorState title="Could not load this bill" error={details.error} onRetry={details.retry} />}

                {bill && (
                    <div className="form-fields">
                        <dl className="detail-list">
                            <div>
                                <dt>Rental</dt>
                                <dd>
                                    {bill.rental.rentalDays} day{bill.rental.rentalDays === 1 ? '' : 's'} × <CurrencyText value={bill.rental.dailyRate} />
                                    {' = '}<CurrencyText value={bill.rental.totalRental} />
                                </dd>
                            </div>
                            <div>
                                <dt>Energy</dt>
                                <dd>
                                    {formatNumber(chargedKm)} km = <CurrencyText value={bill.energy.totalEnergyCharge} />
                                </dd>
                            </div>
                            <div>
                                <dt>Total</dt>
                                <dd><CurrencyText value={bill.totalAmount} /></dd>
                            </div>
                            <div>
                                <dt>Deducted at payout</dt>
                                <dd>
                                    {rider.payout ? <CurrencyText value={rider.payout.totalAmount} /> : '—'}
                                    {rider.payoutPending && <span className="payout-cell__note payout-cell__note--pending">Changed since payout</span>}
                                </dd>
                            </div>
                        </dl>

                        {bill.closed && (
                            <dl className="detail-list">
                                <div>
                                    <dt>Week closed</dt>
                                    <dd>{formatDateTime(bill.closure.closedAt)}</dd>
                                </div>
                                <div>
                                    <dt>Billed total</dt>
                                    <dd>{bill.closure.billed ? <CurrencyText value={bill.closure.billed.totalAmount} /> : 'Not billed'}</dd>
                                </div>
                                <div>
                                    <dt>Difference</dt>
                                    <dd>
                                        {bill.closure.changedSinceClose
                                            ? <CurrencyText value={bill.closure.difference} showSign />
                                            : 'No change'}
                                    </dd>
                                </div>
                            </dl>
                        )}

                        <div>
                            <h4 className="panel__title">Daily KM records ({records.length})</h4>
                            {records.length ? (
                                <div className="table-wrap">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th className="num">KM</th>
                                                <th className="num">Charge</th>
                                                <th>Note</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {records.map(record => (
                                                <tr key={record.kmRecordId}>
                                                    <td className="nowrap">{formatDate(record.usageDate)}</td>
                                                    <td className="num">{formatNumber(record.dailyKm)}</td>
                                                    <td className="num"><CurrencyText value={record.energyCharge} /></td>
                                                    <td>{record.eligible ? <StatusBadge status="Validated" /> : <span className="muted">{record.reason}</span>}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="muted">No validated KM for this rider this week.</p>
                            )}
                        </div>

                        <Link to={`/daily-km?fromDate=${weekStart}&toDate=${addDays(weekStart, 6)}&search=${encodeURIComponent(rider.riderId)}`}>
                            View all Daily KM records for this rider →
                        </Link>
                    </div>
                )}
            </div>
        </dialog>
    );
}
