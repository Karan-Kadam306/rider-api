import StatCard from '../../../components/ui/StatCard';
import StatusBadge from '../../../components/ui/StatusBadge';
import CurrencyText from '../../../components/ui/CurrencyText';
import { getPayoutStatus } from '../../payouts/getPayoutStatus';
import { formatDateTime } from '../../../utils/week';

// Empty until the week's first payout; then the total deducted and any corrections waiting.
export default function PayoutCard({ payout }) {
    let subText = 'No payout triggered yet';

    if (payout.paid) {
        subText = payout.pendingCount
            ? `${payout.pendingCount} rider(s) changed since the payout`
            : `Run ${payout.runCount} · ${formatDateTime(payout.lastRunAt)}`;
    }

    return (
        <StatCard
            label="Payout deductions"
            value={payout.paid ? <CurrencyText value={payout.totalAmount} /> : '—'}
            badge={<StatusBadge status={getPayoutStatus(payout)} />}
            subText={subText}
            to="/payouts"
            linkLabel="Payouts"
        />
    );
}
