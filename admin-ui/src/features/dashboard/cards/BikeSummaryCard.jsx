import StatCard from '../../../components/ui/StatCard';
import StatusBreakdown from '../../../components/ui/StatusBreakdown';

export default function BikeSummaryCard({ bikes }) {
    return (
        <StatCard label="Bikes" value={bikes.total} to="/bikes" linkLabel="All bikes">
            <StatusBreakdown counts={bikes} statuses={['Available', 'Assigned', 'Maintenance']} />
        </StatCard>
    );
}
