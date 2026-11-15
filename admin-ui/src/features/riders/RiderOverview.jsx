import { Link } from 'react-router-dom';

import StatCard from '../../components/ui/StatCard';
import CurrencyText from '../../components/ui/CurrencyText';
import { bikeLabel } from '../../utils/bikeLabel';
import { formatDate } from '../../utils/formatDate';
import { formatDateTime, formatWeekRange } from '../../utils/week';

// The Overview tab: what is owed, this week's bill, the bike and partner IDs, and the rider's details.
export default function RiderOverview({ profile }) {
    const { rider, currentAssignment, partnerMappings, currentWeekBill: bill, outstandingBalance } = profile;

    return (
        <>
            <div className="card-grid">
                <StatCard
                    label="Outstanding balance"
                    value={outstandingBalance === null ? '—' : <CurrencyText value={outstandingBalance} />}
                    subText={outstandingBalance > 0 ? 'Owed from last week' : 'Nothing owed'}
                />
                <StatCard
                    label="Net payout this week"
                    value={bill.requiresReview ? '—' : <CurrencyText value={bill.netPayout} />}
                    subText={bill.requiresReview ? bill.reason : formatWeekRange(bill.weekStart)}
                    to="/billing"
                    linkLabel="Billing"
                />
                <StatCard
                    label="Current bike"
                    value={currentAssignment ? bikeLabel(currentAssignment) : 'None'}
                    subText={currentAssignment
                        ? `Since ${formatDateTime(currentAssignment.assignedAt)}`
                        : 'No bike assigned'}
                />
            </div>

            <div className="widget-grid">
                <section className="card panel">
                    <div className="panel__header">
                        <h3 className="panel__title">This week</h3>
                        <span className="panel__meta">{formatWeekRange(bill.weekStart)}</span>
                    </div>
                    {bill.requiresReview ? (
                        <p className="muted">{bill.reason}</p>
                    ) : (
                        <dl className="detail-list">
                            <div>
                                <dt>Earnings</dt>
                                <dd><CurrencyText value={bill.earnings} /></dd>
                            </div>
                            <div>
                                <dt>Deductions</dt>
                                <dd><CurrencyText value={bill.totalAmount} /></dd>
                            </div>
                            {bill.previousBalance < 0 && (
                                <div>
                                    <dt>Owed from last week</dt>
                                    <dd><CurrencyText value={bill.previousBalance} /></dd>
                                </div>
                            )}
                            {bill.balanceCleared > 0 && (
                                <div>
                                    <dt>Balance cleared</dt>
                                    <dd><CurrencyText value={bill.balanceCleared} /></dd>
                                </div>
                            )}
                            {bill.escalationCharges > 0 && (
                                <div>
                                    <dt>Escalation charges</dt>
                                    <dd><CurrencyText value={-bill.escalationCharges} /></dd>
                                </div>
                            )}
                            <div>
                                <dt>Net payout</dt>
                                <dd><CurrencyText value={bill.netPayout} /></dd>
                            </div>
                        </dl>
                    )}
                </section>

                <section className="card panel">
                    <div className="panel__header">
                        <h3 className="panel__title">Rider details</h3>
                    </div>
                    <dl className="detail-list">
                        <div>
                            <dt>Rider ID</dt>
                            <dd className="mono">{rider.riderId}</dd>
                        </div>
                        <div>
                            <dt>Phone</dt>
                            <dd className="mono">{rider.phone}</dd>
                        </div>
                        <div>
                            <dt>Joined</dt>
                            <dd>{formatDate(rider.joinedAt)}</dd>
                        </div>
                        {rider.terminatedOn && (
                            <div>
                                <dt>Terminated on</dt>
                                <dd>{formatDate(rider.terminatedOn)}</dd>
                            </div>
                        )}
                    </dl>

                    <div className="panel__header">
                        <h3 className="panel__title">Partner IDs</h3>
                        <Link to="/partner-mappings" className="panel__meta">Edit in Partner Mappings</Link>
                    </div>
                    {partnerMappings.length ? (
                        <div className="mapping-chips">
                            {partnerMappings.map(mapping => (
                                <span key={mapping.mappingId} className="mapping-chip">
                                    {mapping.partnerName} <span className="mono">{mapping.partnerRiderId}</span>
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p className="muted">No partner IDs mapped.</p>
                    )}
                </section>
            </div>
        </>
    );
}
