const inrFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const numberFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

// Postgres numeric columns arrive as strings, so convert before formatting.
export function toNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

// 123456 → "₹1,23,456.00"
export function formatINR(value) {
    const number = toNumber(value);
    return number === null ? '—' : inrFormatter.format(number);
}

// 12345.5 → "12,345.5"
export function formatNumber(value) {
    const number = toNumber(value);
    return number === null ? '—' : numberFormatter.format(number);
}
