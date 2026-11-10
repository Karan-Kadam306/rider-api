import Icon from '../../components/ui/Icon';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatDateTime, formatRelativeTime } from '../../utils/formatDate';
import { formatFileSize } from '../../utils/formatFileSize';
import { RowCounts } from './ImportResult';

// One row per uploaded file; onView(importId) opens its details.
// typeLabels: { daily_km: 'Daily KM', ... }; falls back to the raw key.
export default function ImportHistoryTable({ imports, typeLabels, onView }) {
    return (
        <div className="table-wrap">
            <table className="table table--roomy">
                <thead>
                    <tr>
                        <th>File</th>
                        <th>Type</th>
                        <th>Rows</th>
                        <th>Status</th>
                        <th>Uploaded</th>
                        <th className="actions-col">Details</th>
                    </tr>
                </thead>
                <tbody>
                    {imports.map(batch => (
                        <tr key={batch.importId}>
                            <td>
                                <div className="file-cell">
                                    <Icon name="file" size={18} />
                                    <div>
                                        <div className="person__name">{batch.fileName}</div>
                                        <div className="cell-sub">{formatFileSize(batch.fileSizeBytes)}</div>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <span className="badge badge--neutral">{typeLabels[batch.importType] ?? batch.importType}</span>
                                {batch.partnerName && <div className="cell-sub">{batch.partnerName}</div>}
                            </td>
                            <td><RowCounts batch={batch} /></td>
                            <td><StatusBadge status={batch.status} /></td>
                            <td className="nowrap" title={formatDateTime(batch.createdAt)}>{formatRelativeTime(batch.createdAt)}</td>
                            <td className="actions-col">
                                <button
                                    type="button"
                                    className="button button--icon"
                                    aria-label={`View details of ${batch.fileName}`}
                                    onClick={() => onView(batch.importId)}
                                >
                                    <Icon name="eye" size={17} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
