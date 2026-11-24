import CurrencyText from '../../components/ui/CurrencyText';
import Icon from '../../components/ui/Icon';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatDate } from '../../utils/formatDate';

// Price history, newest first: postpaid rates or deposit amounts.
// amounts: [{ key, label }] for the money columns. Only a price that has not started can be removed.
export default function PriceHistoryTable({ rows, idKey, amounts, currentId, today, onRemove }) {
    function statusOf(row) {
        if (row.effectiveFrom > today) {
            return 'Scheduled';
        }

        return row[idKey] === currentId ? 'In effect' : 'Ended';
    }

    return (
        <div className="table-wrap">
            <table className="table">
                <thead>
                    <tr>
                        <th>Starts on</th>
                        {amounts.map(amount => <th key={amount.key} className="num">{amount.label}</th>)}
                        <th>Status</th>
                        <th>Added by</th>
                        <th className="actions-col">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => {
                        const status = statusOf(row);

                        return (
                            <tr key={row[idKey]}>
                                <td className="nowrap">{formatDate(row.effectiveFrom)}</td>
                                {amounts.map(amount => (
                                    <td key={amount.key} className="num"><CurrencyText value={row[amount.key]} /></td>
                                ))}
                                <td><StatusBadge status={status} /></td>
                                <td className="muted">{row.createdBy ?? 'System'}</td>
                                <td className="actions-col">
                                    {status === 'Scheduled' && (
                                        <div className="row-actions">
                                            <button
                                                type="button"
                                                className="pill-button pill-button--danger"
                                                onClick={() => onRemove(row)}
                                            >
                                                <Icon name="close" size={15} />
                                                Remove
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
