import StatCard from '../../../components/ui/StatCard';
import StatusBadge from '../../../components/ui/StatusBadge';
import CurrencyText from '../../../components/ui/CurrencyText';
import { formatINR } from '../../../utils/formatCurrency';

// Rental plus energy. The value is always live; a closed week also shows what was billed at close.
export default function WeeklyTotalCard({ billing }) {
    return (
        <StatCard
            label="Weekly total"
            value={<CurrencyText value={billing.totalAmount} />}
            badge={<StatusBadge status={billing.closed ? 'Closed' : 'Open'} />}
            subText={billing.closed ? `Billed at close: ${formatINR(billing.billedTotalAmount)}` : 'Live total, week not closed'}
            to="/billing"
            linkLabel="Billing"
        />
    );
}
