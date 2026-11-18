import { getBillingSummary } from '../api/billingApi';
import { getBikeSummary } from '../api/bikesApi';
import { getDailyKmRecords } from '../api/dailyKmApi';
import { getImportSummary } from '../api/importsApi';
import { getRiderSummary } from '../api/ridersApi';
import { useWeek } from '../context/WeekContext';
import { addDays } from '../utils/week';
import { useApi } from './useApi';

// The billing summary works out every rider's bill, so only a few weeks are asked for at a time.
const PARALLEL_REQUESTS = 4;
// /api/daily-km allows at most 100 records a page.
const KM_PAGE_SIZE = 100;
// Stops a very long range from sending hundreds of requests; the page says when it was cut short.
const MAX_KM_PAGES = 30;

// Runs task(item) for every item, at most `limit` at once, and keeps the results in order.
async function mapWithLimit(items, limit, task) {
    const results = new Array(items.length);
    let next = 0;

    async function worker() {
        while (next < items.length) {
            const index = next;
            next += 1;
            results[index] = await task(items[index]);
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

// Every km record in the range, page by page.
async function getAllDailyKm({ fromDate, toDate }, { signal }) {
    const first = await getDailyKmRecords({ fromDate, toDate, page: 1, limit: KM_PAGE_SIZE }, { signal });
    const pageCount = Math.min(first.pagination.totalPages, MAX_KM_PAGES);
    const pages = Array.from({ length: Math.max(pageCount - 1, 0) }, (_, index) => index + 2);

    const rest = await mapWithLimit(pages, PARALLEL_REQUESTS, page =>
        getDailyKmRecords({ fromDate, toDate, page, limit: KM_PAGE_SIZE }, { signal })
    );

    return {
        records: [first, ...rest].flatMap(result => result.records),
        statusCounts: first.statusCounts,
        truncated: first.pagination.totalPages > MAX_KM_PAGES
    };
}

// Week starts for the range, oldest first, ending with the selected week.
export function getRangeWeeks(weekStart, weekCount) {
    return Array.from({ length: weekCount }, (_, index) => addDays(weekStart, -7 * (weekCount - 1 - index)));
}

// Everything the Analytics page shows, built only from existing endpoints:
// one billing summary per week, the km records for the range, and the current fleet, rider and import summaries.
export function useAnalytics(weekCount) {
    const { weekStart, refreshKey } = useWeek();

    return useApi(
        async ({ signal }) => {
            const weekStarts = getRangeWeeks(weekStart, weekCount);

            const [weeks, dailyKm, bikes, riders, imports] = await Promise.all([
                mapWithLimit(weekStarts, PARALLEL_REQUESTS, week => getBillingSummary(week, { signal })),
                getAllDailyKm({ fromDate: weekStarts[0], toDate: addDays(weekStart, 6) }, { signal }),
                getBikeSummary({ signal }),
                getRiderSummary({ signal }),
                getImportSummary({ signal })
            ]);

            return { weekStarts, weeks, dailyKm, bikes, riders, imports };
        },
        [weekStart, weekCount, refreshKey]
    );
}
