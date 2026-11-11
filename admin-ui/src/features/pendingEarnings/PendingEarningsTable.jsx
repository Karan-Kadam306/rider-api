import CurrencyText from '../../components/ui/CurrencyText';
import Icon from '../../components/ui/Icon';
import { formatDate } from '../../utils/formatDate';

// "26 Oct 2026" or "26 Oct 2026 – 1 Nov 2026".
function dateRange(group) {
    return group.firstDate === group.lastDate
        ? formatDate(group.firstDate)
        : `${formatDate(group.firstDate)} – ${formatDate(group.lastDate)}`;
}

// One row per unknown partner ID; onResolve(group) and onDismiss(group) open their dialogs.
export default function PendingEarningsTable({ groups, onResolve, onDismiss }) {
    return (
        <div className="table-wrap">
            <table className="table table--roomy">
                <thead>
                    <tr>
                        <th>Partner ID</th>
                        <th>Partner</th>
                        <th>Dates</th>
                        <th className="num">Entries</th>
                        <th className="num">Amount</th>
                        <th className="actions-col">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {groups.map(group => (
                        <tr key={`${group.partnerId}-${group.partnerRiderId}`}>
                            <td>
                                <span className="person__name mono">{group.partnerRiderId}</span>
                                <div className="cell-sub">{group.nameInFile ?? 'No name in the sheet'}</div>
                            </td>
                            <td>{group.partnerName}</td>
                            <td className="nowrap">{dateRange(group)}</td>
                            <td className="num">{group.entries}</td>
                            <td className="num"><CurrencyText value={group.totalAmount} /></td>
                            <td className="actions-col">
                                <div className="row-actions">
                                    <button type="button" className="pill-button" onClick={() => onResolve(group)}>
                                        <Icon name="userCheck" size={15} />
                                        Resolve
                                    </button>
                                    <button type="button" className="pill-button pill-button--danger" onClick={() => onDismiss(group)}>
                                        <Icon name="close" size={15} />
                                        Dismiss
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
