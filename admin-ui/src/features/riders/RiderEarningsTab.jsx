import { useState } from 'react';

import { getRiderPayouts } from '../../api/ridersApi';
import { useApi } from '../../hooks/useApi';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import LoadingSkeleton from '../../components/feedback/LoadingSkeleton';
import CurrencyText from '../../components/ui/CurrencyText';
import Pagination from '../../components/ui/Pagination';
import { formatWeekRange } from '../../utils/week';

const PAGE_SIZE = 10;

// The Earnings tab: what each payout paid the rider, newest week first.
// Payouts from before partner earnings or escalations have no value for those columns.
export default function RiderEarningsTab({ riderId }) {
    const [page, setPage] = useState(1);
    const list = useApi(options => getRiderPayouts(riderId, { page, limit: PAGE_SIZE }, options), [riderId, page]);

    if (list.loading) {
        return <LoadingSkeleton variant="table" rows={5} />;
    }

    if (list.error) {
        return <ErrorState title="Could not load payouts" error={list.error} onRetry={list.retry} />;
    }

    return (
        <section className="card card--flush">
            {list.data.payouts.length ? (
                <>
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Week</th>
                                    <th className="num">Rental days</th>
                                    <th className="num">Deductions</th>
                                    <th className="num">Earnings</th>
                                    <th className="num">Escalation charges</th>
                                    <th className="num">Balance cleared</th>
                                    <th className="num">Net payout</th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.data.payouts.map(payout => (
                                    <tr key={payout.weekStart}>
                                        <td className="nowrap">{formatWeekRange(payout.weekStart)}</td>
                                        <td className="num">{payout.rentalDays}</td>
                                        <td className="num"><CurrencyText value={payout.totalAmount} /></td>
                                        <td className="num"><CurrencyText value={payout.earnings} /></td>
                                        <td className="num"><CurrencyText value={payout.escalationCharges} /></td>
                                        <td className="num"><CurrencyText value={payout.balanceCleared} /></td>
                                        <td className="num"><strong><CurrencyText value={payout.netPayout} /></strong></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination {...list.data.pagination} onPageChange={setPage} />
                </>
            ) : (
                <div className="card__empty">
                    <EmptyState message="No payouts for this rider yet." />
                </div>
            )}
        </section>
    );
}
