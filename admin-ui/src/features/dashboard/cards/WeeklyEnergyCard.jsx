import StatCard from '../../../components/ui/StatCard';
import CurrencyText from '../../../components/ui/CurrencyText';
import { formatNumber } from '../../../utils/formatCurrency';

export default function WeeklyEnergyCard({ billing }) {
    return (
        <StatCard
            label="Weekly energy"
            value={<CurrencyText value={billing.totalEnergyCharge} />}
            subText={`${formatNumber(billing.totalKm)} km charged`}
        />
    );
}
