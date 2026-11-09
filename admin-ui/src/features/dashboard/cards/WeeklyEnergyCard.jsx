import StatCard from '../../../components/ui/StatCard';
import CurrencyText from '../../../components/ui/CurrencyText';
import { formatNumber } from '../../../utils/formatCurrency';

// Energy charged across all riders for the week's validated KM.
export default function WeeklyEnergyCard({ billing }) {
    return (
        <StatCard
            label="Weekly energy"
            value={<CurrencyText value={billing.totalEnergyCharge} />}
            subText={`${formatNumber(billing.totalKm)} km charged`}
        />
    );
}
