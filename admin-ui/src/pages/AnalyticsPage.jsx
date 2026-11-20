import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useWeek } from '../context/WeekContext';
import { useAnalytics, getRangeWeeks } from '../hooks/useAnalytics';
import PageHeader from '../components/layout/PageHeader';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import { formatWeekRange } from '../utils/week';

import { buildAnalytics, formatShortDate } from '../features/analytics/buildAnalytics';
import KpiTile from '../features/analytics/KpiTile';
import MoneyPanel from '../features/analytics/panels/MoneyPanel';
import DeductionsPanel from '../features/analytics/panels/DeductionsPanel';
import KmPanel from '../features/analytics/panels/KmPanel';
import FleetPanel from '../features/analytics/panels/FleetPanel';
import TopBikesPanel from '../features/analytics/panels/TopBikesPanel';
import CollectionsPanel from '../features/analytics/panels/CollectionsPanel';
import DataHealthPanel from '../features/analytics/panels/DataHealthPanel';
import TeamLeaderPanel from '../features/analytics/panels/TeamLeaderPanel';

const RANGES = [4, 8, 12];
const DEFAULT_RANGE = 8;
const KPI_COUNT = 6;

// Range buttons; the choice is kept in the URL so a view can be bookmarked or shared.
function RangeToggle({ value, onChange }) {
    return (
        <div className="range-toggle" role="group" aria-label="Range">
            {RANGES.map(weeks => (
                <button
                    key={weeks}
                    type="button"
                    aria-pressed={value === weeks}
                    className={`range-toggle__option${value === weeks ? ' range-toggle__option--active' : ''}`}
                    onClick={() => onChange(weeks)}
                >
                    {weeks} weeks
                </button>
            ))}
        </div>
    );
}

function AnalyticsSkeleton() {
    return (
        <>
            <div className="card-grid card-grid--compact">
                {Array.from({ length: KPI_COUNT }, (_, index) => (
                    <LoadingSkeleton key={index} />
                ))}
            </div>
            <div className="analytics__grid">
                <LoadingSkeleton variant="table" />
                <LoadingSkeleton variant="table" />
            </div>
        </>
    );
}

// Company trends over several billing weeks, ending with the week picked in the top bar.
// Overview is for this week's work; this page is for how the business is going.
export default function AnalyticsPage() {
    const { weekStart } = useWeek();
    const [searchParams, setSearchParams] = useSearchParams();
    const requested = Number(searchParams.get('weeks'));
    const weekCount = RANGES.includes(requested) ? requested : DEFAULT_RANGE;

    const { data, loading, error, retry } = useAnalytics(weekCount);
    const analytics = useMemo(() => (data ? buildAnalytics(data) : null), [data]);

    const firstWeek = getRangeWeeks(weekStart, weekCount)[0];

    return (
        <div className="analytics">
            <PageHeader
                title="Analytics"
                subtitle={`${formatShortDate(firstWeek)} – ${formatWeekRange(weekStart).split('– ')[1]} · ${weekCount} billing weeks`}
                actions={(
                    <RangeToggle
                        value={weekCount}
                        onChange={weeks => setSearchParams(params => {
                            params.set('weeks', weeks);
                            return params;
                        })}
                    />
                )}
            />

            {loading && <AnalyticsSkeleton />}

            {error && <ErrorState title="Could not load analytics" error={error} onRetry={retry} />}

            {analytics && (
                <>
                    <div className="card-grid card-grid--compact">
                        {analytics.kpis.map(kpi => (
                            <KpiTile key={kpi.key} kpi={kpi} weekCount={weekCount} />
                        ))}
                    </div>

                    <div className="analytics__grid">
                        <MoneyPanel weeks={analytics.weeks} />
                        <DeductionsPanel weeks={analytics.weeks} />
                        <CollectionsPanel latest={analytics.latest} riders={analytics.owingRiders} />
                        <KmPanel weeks={analytics.weeks} truncated={analytics.kmTruncated} />
                        <TopBikesPanel bikes={analytics.topBikes} />
                        <FleetPanel bikes={analytics.bikes} riders={analytics.riders} />
                        <DataHealthPanel analytics={analytics} weekCount={weekCount} />
                        <TeamLeaderPanel teamLeaders={data.teamLeaders} />
                    </div>
                </>
            )}
        </div>
    );
}
