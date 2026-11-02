import Icon from '../../components/ui/Icon';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatDate, formatDateTime, formatRelativeTime } from '../../utils/formatDate';

const kmFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

// One row per VIN per day. Needs Review rows offer Resolve.
export default function DailyKmTable({ records, onResolve }) {
    return (
        <div className="table-wrap">
            <table className="table table--roomy">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>VIN</th>
                        <th>Rider</th>
                        <th className="num">KM</th>
                        <th>Status</th>
                        <th>Source file</th>
                        <th className="actions-col">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {records.map(record => (
                        <tr key={record.km_record_id}>
                            <td className="nowrap">{formatDate(record.usage_date)}</td>
                            <td>
                                <div className="mono">{record.reported_vin}</div>
                                {record.bike_id === null && <div className="cell-sub">Not matched to a bike</div>}
                            </td>
                            <td>
                                {record.rider_id ? (
                                    <>
                                        <div className="person__name">{record.rider_name}</div>
                                        <div className="cell-sub">{record.rider_id}</div>
                                    </>
                                ) : (
                                    <span className="muted">No rider yet</span>
                                )}
                            </td>
                            <td className="num">{kmFormat.format(record.daily_km)}</td>
                            <td><StatusBadge status={record.status} /></td>
                            <td>
                                <div>{record.source_file_name}</div>
                                <div className="cell-sub" title={formatDateTime(record.uploaded_at)}>
                                    {formatRelativeTime(record.uploaded_at)}
                                </div>
                            </td>
                            <td className="actions-col">
                                {record.status === 'Needs Review' && (
                                    <button type="button" className="pill-button" onClick={() => onResolve(record)}>
                                        <Icon name="userCheck" size={15} />
                                        Resolve
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
