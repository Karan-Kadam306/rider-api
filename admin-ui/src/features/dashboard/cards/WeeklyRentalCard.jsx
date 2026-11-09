import StatCard from '../../../components/ui/StatCard';
import CurrencyText from '../../../components/ui/CurrencyText';

// Rental charged across all riders this week.
export default function WeeklyRentalCard({ billing }) {
    return (
        <StatCard
            label="Weekly rental"
            value={<CurrencyText value={billing.totalRental} />}
            subText={`Across ${billing.riderCount} rider${billing.riderCount === 1 ? '' : 's'}`}
        />
    );
}
