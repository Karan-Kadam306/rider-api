import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import { getImport } from '../../api/importsApi';
import { useApi } from '../../hooks/useApi';
import Icon from '../../components/ui/Icon';
import ErrorState from '../../components/feedback/ErrorState';
import { formatDate, formatDateTime } from '../../utils/formatDate';
import { formatFileSize } from '../../utils/formatFileSize';
import ImportResult from './ImportResult';

// "VIN: VIN-2, KM: -5". The database (jsonb) does not keep column order,
// so the type's required columns come first, in their usual order.
function formatRowData(rowData, requiredColumns = []) {
    const columns = [
        ...requiredColumns.filter(column => column in rowData),
        ...Object.keys(rowData).filter(column => !requiredColumns.includes(column))
    ];

    return columns
        .map(column => `${column}: ${rowData[column] === '' ? '(empty)' : rowData[column]}`)
        .join(', ');
}

// Side panel with one import's details and its failed rows. Mounted only while open.
// types: the import types list, for the type's label and column order.
export default function ImportDetailsPanel({ importId, types, onClose }) {
    const dialogRef = useRef(null);
    const details = useApi(options => getImport(importId, options), [importId]);

    useEffect(() => {
        dialogRef.current.showModal();
    }, []);

    function handleCancel(event) {
        // Escape key: close through the parent, which unmounts this panel.
        event.preventDefault();
        onClose();
    }

    const batch = details.data?.import;
    const rowErrors = details.data?.rowErrors ?? [];
    const type = types.find(item => item.key === batch?.importType);
    const partner = type?.partners?.find(item => item.partnerId === batch.partnerId);
    const requiredColumns = partner?.requiredColumns ?? type?.requiredColumns;

    return (
        <dialog ref={dialogRef} className="drawer drawer--wide" onCancel={handleCancel} aria-labelledby="import-details-title">
            <div className="drawer__header">
                <div>
                    <h3 id="import-details-title" className="dialog__title">Import details</h3>
                    {batch && <p className="cell-sub">{batch.fileName}</p>}
                </div>
                <button type="button" className="button button--icon" aria-label="Close" onClick={onClose}>
                    <Icon name="close" size={16} />
                </button>
            </div>

            <div className="drawer__body">
                {details.loading && <p className="muted">Loading details…</p>}

                {details.error && <ErrorState title="Could not load this import" error={details.error} onRetry={details.retry} />}

                {batch && (
                    <div className="form-fields">
                        <dl className="detail-list">
                            <div>
                                <dt>Type</dt>
                                <dd>{type?.label ?? batch.importType}</dd>
                            </div>
                            {batch.partnerName && (
                                <div>
                                    <dt>Partner</dt>
                                    <dd>{batch.partnerName}</dd>
                                </div>
                            )}
                            {batch.workDate && (
                                <div>
                                    <dt>Work date</dt>
                                    <dd>{formatDate(batch.workDate)}</dd>
                                </div>
                            )}
                            <div>
                                <dt>Uploaded</dt>
                                <dd>{formatDateTime(batch.createdAt)}</dd>
                            </div>
                            <div>
                                <dt>File size</dt>
                                <dd>{formatFileSize(batch.fileSizeBytes)}</dd>
                            </div>
                        </dl>

                        <ImportResult batch={batch} />

                        {batch.importType === 'daily_km' && batch.successRows > 0 && (
                            <Link to={`/daily-km?fromDate=${batch.workDate}&toDate=${batch.workDate}`}>
                                View Daily KM records for this date →
                            </Link>
                        )}

                        {batch.resultSummary?.pending > 0 && (
                            <Link to={`/pending-earnings?partnerId=${batch.partnerId}`}>
                                Review pending {batch.partnerName} earnings →
                            </Link>
                        )}

                        {rowErrors.length > 0 && (
                            <div>
                                <h4 className="panel__title">Failed rows ({rowErrors.length})</h4>
                                <div className="table-wrap">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Line</th>
                                                <th>Values</th>
                                                <th>Reason</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rowErrors.map(rowError => (
                                                <tr key={rowError.rowNumber}>
                                                    <td className="mono">{rowError.rowNumber}</td>
                                                    <td className="mono">{formatRowData(rowError.rowData, requiredColumns)}</td>
                                                    <td>{rowError.errorMessage}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </dialog>
    );
}
