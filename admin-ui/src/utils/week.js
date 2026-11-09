// Dates are plain YYYY-MM-DD strings, matching what the backend expects.
const IST = 'Asia/Kolkata';

// Today's date in India, whatever time zone the browser is in.
export function todayInIst() {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date());
}

// Date arithmetic stays in UTC so the browser's time zone and daylight saving cannot shift a day.
export function addDays(date, days) {
    const result = new Date(`${date}T00:00:00.000Z`);
    result.setUTCDate(result.getUTCDate() + days);
    return result.toISOString().slice(0, 10);
}

export function isMonday(date) {
    return new Date(`${date}T00:00:00.000Z`).getUTCDay() === 1;
}

// Billing weeks run Monday to Sunday.
export function toMonday(date) {
    const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    // getUTCDay() is 0 for Sunday, so this gives the days since Monday: Mon 0, Tue 1 … Sun 6.
    return addDays(date, -((day + 6) % 7));
}

// Monday of the current week in IST.
export function currentWeekStart() {
    return toMonday(todayInIst());
}

// Same rule as billingService.closeWeek: closable from the next Monday.
export function hasWeekEnded(weekStart) {
    return todayInIst() >= addDays(weekStart, 7);
}

// UTC on both sides, so the date prints exactly as written and never moves a day.
function formatDay(date, options) {
    return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', ...options })
        .format(new Date(`${date}T00:00:00.000Z`));
}

// "26 Oct – 1 Nov 2026"
export function formatWeekRange(weekStart) {
    const start = formatDay(weekStart, { day: 'numeric', month: 'short' });
    const end = formatDay(addDays(weekStart, 6), { day: 'numeric', month: 'short', year: 'numeric' });
    return `${start} – ${end}`;
}

// Timestamps such as closedAt, shown in IST.
export function formatDateTime(value) {
    if (!value) {
        return '—';
    }

    return new Intl.DateTimeFormat('en-IN', {
        timeZone: IST,
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(new Date(value));
}
