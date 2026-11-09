import StatCard from '../../../components/ui/StatCard';
import StatusBreakdown from '../../../components/ui/StatusBreakdown';

// Total riders, with a count for each status.
export default function RiderSummaryCard({ riders }) {
    return (
        <StatCard label="Riders" value={riders.total} to="/riders" linkLabel="All riders">
            <StatusBreakdown counts={riders} statuses={['Active', 'Inactive', 'Terminated']} />
        </StatCard>
    );
}
