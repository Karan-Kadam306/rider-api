import { formatINR, toNumber } from '../../utils/formatCurrency';

// Rupee amount; showSign colours differences (+ red for more owed, − green).
export default function CurrencyText({ value, showSign = false }) {
    const number = toNumber(value);

    if (!showSign || number === null || number === 0) {
        return <span className="currency">{formatINR(value)}</span>;
    }

    const tone = number > 0 ? 'currency--up' : 'currency--down';
    const sign = number > 0 ? '+' : '−';

    return <span className={`currency ${tone}`}>{sign}{formatINR(Math.abs(number))}</span>;
}
