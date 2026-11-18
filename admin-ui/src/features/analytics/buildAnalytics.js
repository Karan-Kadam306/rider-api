import { toNumber } from '../../utils/formatCurrency';
import { addDays } from '../../utils/week';

const TOP_BIKE_LIMIT = 8;
const OWING_RIDER_LIMIT = 5;

const shortDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' });

// "26 Oct" for a week start.
export function formatShortDate(date) {
    return shortDate.format(new Date(`${date}T00:00:00.000Z`));
}

function sum(values) {
    return values.reduce((total, value) => total + (toNumber(value) ?? 0), 0);
}

// Change from the previous week as a fraction; null when there is nothing to compare with.
function change(values) {
    if (values.length < 2) {
        return null;
    }

    const previous = values.at(-2);
    const latest = values.at(-1);

    if (!previous) {
        return null;
    }

    return (latest - previous) / Math.abs(previous);
}

// Km per date, plus each bike's total, from the raw daily records.
function groupDailyKm(records) {
    const kmByDate = new Map();
    const bikes = new Map();

    for (const record of records) {
        const km = toNumber(record.daily_km) ?? 0;
        kmByDate.set(record.usage_date, (kmByDate.get(record.usage_date) ?? 0) + km);

        // Unmatched VINs still ran, so they are listed by the VIN in the file.
        const key = record.chassis_number ?? record.reported_vin;
        const bike = bikes.get(key) ?? { bike: key, bikeId: record.bike_id, km: 0, days: 0 };
        bike.km += km;
        bike.days += 1;
        bikes.set(key, bike);
    }

    return { kmByDate, bikes: [...bikes.values()] };
}

// Turns the raw API responses into the numbers each part of the page shows.
export function buildAnalytics({ weekStarts, weeks, dailyKm, bikes, riders, imports }) {
    const { kmByDate, bikes: bikeTotals } = groupDailyKm(dailyKm.records);

    const weekRows = weeks.map((summary, index) => {
        const weekStart = weekStarts[index];
        const days = Array.from({ length: 7 }, (_, day) => {
            const date = addDays(weekStart, day);
            return { date, km: kmByDate.get(date) ?? null };
        });
        const billed = summary.riders.filter(rider => !rider.requiresReview);
        const owing = billed.filter(rider => rider.netPayout < 0);

        return {
            weekStart,
            label: formatShortDate(weekStart),
            closed: summary.closed,
            earnings: toNumber(summary.totalEarnings) ?? 0,
            rental: toNumber(summary.totalRental) ?? 0,
            energy: toNumber(summary.totalEnergyCharge) ?? 0,
            deductions: toNumber(summary.totalAmount) ?? 0,
            netPayout: toNumber(summary.totalNetPayout) ?? 0,
            km: sum(days.map(day => day.km)),
            days,
            ridersOnBike: billed.filter(rider => rider.rentalDays > 0).length,
            rentalDays: sum(billed.map(rider => rider.rentalDays)),
            reviewCount: summary.reviewCount,
            pendingEarningsCount: summary.pendingEarningsCount,
            rejectedEarningsCount: summary.rejectedEarningsCount,
            owingCount: owing.length,
            // || 0 turns -0 into 0 when nobody owes anything.
            owedAmount: -sum(owing.map(rider => rider.netPayout)) || 0,
            owing
        };
    });

    const latest = weekRows.at(-1);
    // Rider-days on a bike against today's fleet; the API has no fleet size per past week.
    const utilisation = weekRows.map(week => (bikes.total ? week.rentalDays / (bikes.total * 7) : null));

    const series = key => weekRows.map(week => week[key]);

    return {
        weeks: weekRows,
        latest,
        kpis: [
            { key: 'earnings', label: 'Partner earnings', format: 'inr', total: sum(series('earnings')), values: series('earnings'), change: change(series('earnings')), upIsGood: true },
            { key: 'deductions', label: 'Deductions', format: 'inr', total: sum(series('deductions')), values: series('deductions'), change: change(series('deductions')), upIsGood: null },
            { key: 'netPayout', label: 'Net payout', format: 'inr', total: sum(series('netPayout')), values: series('netPayout'), change: change(series('netPayout')), upIsGood: true },
            { key: 'km', label: 'Km run', format: 'km', total: sum(series('km')), values: series('km'), change: change(series('km')), upIsGood: true },
            { key: 'ridersOnBike', label: 'Riders on a bike', format: 'count', total: latest.ridersOnBike, totalNote: 'latest week', values: series('ridersOnBike'), change: change(series('ridersOnBike')), upIsGood: true },
            { key: 'utilisation', label: 'Fleet utilisation', format: 'percent', total: utilisation.at(-1), totalNote: 'latest week', values: utilisation, change: change(utilisation), upIsGood: true }
        ],
        topBikes: [...bikeTotals]
            .sort((a, b) => b.km - a.km)
            .slice(0, TOP_BIKE_LIMIT)
            .map(bike => ({ ...bike, avgKm: bike.days ? bike.km / bike.days : 0 })),
        owingRiders: [...latest.owing]
            .sort((a, b) => a.netPayout - b.netPayout)
            .slice(0, OWING_RIDER_LIMIT),
        bikes,
        riders,
        imports,
        kmStatusCounts: dailyKm.statusCounts,
        kmTruncated: dailyKm.truncated,
        closedWeeks: weekRows.filter(week => week.closed).length
    };
}
