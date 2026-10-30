import { getDashboard } from '../api/dashboardApi';
import { useWeek } from '../context/WeekContext';
import { useApi } from './useApi';

// Whole dashboard for the selected week; refetches on week change or Refresh.
export function useDashboard() {
    const { weekStart, refreshKey } = useWeek();

    return useApi(
        ({ signal }) => getDashboard(weekStart, { signal }),
        [weekStart, refreshKey]
    );
}
