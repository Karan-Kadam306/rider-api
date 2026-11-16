import Icon from '../../components/ui/Icon';
import { formatDate } from '../../utils/formatDate';

// "Partner ID: BLK-2, Total Earnings: abc"; an empty cell shows as (empty).
function formatRowData(rowData) {
    return Object.entries(rowData)
        .map(([column, value]) => `${column}: ${value === '' ? '(empty)' : value}`)
        .join(', ');
}

// Earnings rows that failed to import, one per row; onDismiss(rowError) opens the dismiss dialog.
// Re-uploading the corrected row clears it without a dismiss.
export default function RejectedRowsTable({ rowErrors, onDismiss }) {
    return (
        <div className="table-wrap">
            <table className="table table--roomy">
                <thead>
                    <tr>
                        <th>Partner ID</th>
                        <th>Partner</th>
                        <th>Date</th>
                        <th>Reason</th>
                        <th>File</th>
                        <th className="actions-col">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {rowErrors.map(rowError => (
                        <tr key={rowError.errorId}>
                            <td>
                                <span className="person__name mono">{rowError.partnerRiderId ?? '—'}</span>
                                <div className="cell-sub mono">{formatRowData(rowError.rowData)}</div>
                            </td>
                            <td>{rowError.partnerName}</td>
                            <td className="nowrap">
                                {rowError.earningDate ? formatDate(rowError.earningDate) : 'Unreadable (blocks every week)'}
                            </td>
                            <td>{rowError.errorMessage}</td>
                            <td>
                                {rowError.fileName}
                                <div className="cell-sub">Import #{rowError.importId} · line {rowError.rowNumber}</div>
                            </td>
                            <td className="actions-col">
                                <div className="row-actions">
                                    <button type="button" className="pill-button pill-button--danger" onClick={() => onDismiss(rowError)}>
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
