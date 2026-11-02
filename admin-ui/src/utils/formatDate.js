const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

// "30 Oct 2026"
export function formatDate(value) {
    return dateFormat.format(new Date(value));
}

// "30 Oct 2026, 2:15 pm"
export function formatDateTime(value) {
    return dateTimeFormat.format(new Date(value));
}

const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const RELATIVE_UNITS = [
    ['day', 24 * 60 * 60],
    ['hour', 60 * 60],
    ['minute', 60]
];

// "28 minutes ago", "yesterday"; older than a week falls back to the date.
export function formatRelativeTime(value) {
    const seconds = Math.round((new Date(value) - Date.now()) / 1000);

    if (Math.abs(seconds) >= 7 * 24 * 60 * 60) {
        return formatDate(value);
    }

    for (const [unit, unitSeconds] of RELATIVE_UNITS) {
        if (Math.abs(seconds) >= unitSeconds) {
            return relativeFormat.format(Math.trunc(seconds / unitSeconds), unit);
        }
    }

    return 'just now';
}
