import { useWeek } from '../context/WeekContext';
import { useDashboard } from '../hooks/useDashboard';
import PageHeader from '../components/layout/PageHeader';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import { formatWeekRange } from '../utils/week';

import RiderSummaryCard from '../features/dashboard/cards/RiderSummaryCard';
import BikeSummaryCard from '../features/dashboard/cards/BikeSummaryCard';
import WeeklyRentalCard from '../features/dashboard/cards/WeeklyRentalCard';
import WeeklyEnergyCard from '../features/dashboard/cards/WeeklyEnergyCard';
import WeeklyTotalCard from '../features/dashboard/cards/WeeklyTotalCard';
import NeedsAttentionCard from '../features/dashboard/cards/NeedsAttentionCard';

import WeekStatusPanel from '../features/dashboard/widgets/WeekStatusPanel';
import ChangedSinceCloseTable from '../features/dashboard/widgets/ChangedSinceCloseTable';
import RidersNeedingReviewTable from '../features/dashboard/widgets/RidersNeedingReviewTable';
import DailyKmQueuePanel from '../features/dashboard/widgets/DailyKmQueuePanel';
import TopRidersTable from '../features/dashboard/widgets/TopRidersTable';
import WeeklyTrendChart from '../features/dashboard/widgets/WeeklyTrendChart';

const CARD_COUNT = 6;

function DashboardSkeleton() {
    return (
        <>
            <div className="card-grid">
                {Array.from({ length: CARD_COUNT }, (_, index) => (
                    <LoadingSkeleton key={index} />
                ))}
            </div>
            <div className="widget-grid">
                <LoadingSkeleton variant="table" />
                <LoadingSkeleton variant="table" />
            </div>
        </>
    );
}

// One request feeds every card and widget; children only render their slice.
export default function DashboardPage() {
    const { weekStart, refresh } = useWeek();
    const { data, loading, error, retry } = useDashboard();

    return (
        <>
            <PageHeader title="Overview" subtitle={`Billing week ${formatWeekRange(weekStart)}`} />

            {loading && <DashboardSkeleton />}

            {error && <ErrorState title="Could not load the dashboard" error={error} onRetry={retry} />}

            {data && (
                <>
                    <div className="card-grid">
                        <RiderSummaryCard riders={data.riders} />
                        <BikeSummaryCard bikes={data.bikes} />
                        <WeeklyRentalCard billing={data.billing} />
                        <WeeklyEnergyCard billing={data.billing} />
                        <WeeklyTotalCard billing={data.billing} />
                        <NeedsAttentionCard attention={data.attention} />
                    </div>

                    <div className="widget-grid">
                        <WeekStatusPanel
                            weekStart={weekStart}
                            billing={data.billing}
                            reviewCount={data.attention.ridersNeedingReview}
                            onClosed={refresh}
                        />
                        <DailyKmQueuePanel dailyKm={data.dailyKm} />
                        <RidersNeedingReviewTable rows={data.ridersNeedingReview} />
                        <ChangedSinceCloseTable rows={data.changedSinceClose} closed={data.billing.closed} />
                        <TopRidersTable rows={data.topRiders} />
                        <WeeklyTrendChart />
                    </div>
                </>
            )}
        </>
    );
}
