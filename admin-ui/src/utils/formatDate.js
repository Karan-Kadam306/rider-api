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
