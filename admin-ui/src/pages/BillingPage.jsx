import { useWeek } from '../context/WeekContext';
import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/feedback/EmptyState';
import { formatWeekRange } from '../utils/week';

export default function BillingPage() {
    const { weekStart } = useWeek();

    return (
        <>
            <PageHeader title="Billing" subtitle={`Every rider's bill for ${formatWeekRange(weekStart)}`} />
            <EmptyState message="The per-rider billing table is coming next." />
        </>
    );
}
