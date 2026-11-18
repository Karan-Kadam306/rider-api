import { formatINR, formatNumber, toNumber } from '../../utils/formatCurrency';

// en-IN compact gives lakh and crore: 1,25,000 → "1.3L".
const compactFormatter = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
const percentFormatter = new Intl.NumberFormat('en-IN', { style: 'percent', maximumFractionDigits: 0 });

// Short form for axis ticks and tiles.
export function formatCompact(value, format) {
    const number = toNumber(value);

    if (number === null) {
        return '—';
    }

    if (format === 'percent') {
        return percentFormatter.format(number);
    }

    const size = Math.abs(number);
    const text = size < 1000 ? formatNumber(Math.round(size)) : compactFormatter.format(size);
    const sign = number < 0 ? '−' : '';
    return format === 'inr' ? `${sign}₹${text}` : `${sign}${text}`;
}

// Full form for tooltips and tables.
export function formatMetric(value, format) {
    if (format === 'inr') {
        return formatINR(value);
    }

    if (format === 'percent') {
        return formatCompact(value, 'percent');
    }

    if (format === 'km') {
        return toNumber(value) === null ? '—' : `${formatNumber(value)} km`;
    }

    return formatNumber(value);
}
