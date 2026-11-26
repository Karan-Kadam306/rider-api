import { Link, useNavigate } from 'react-router-dom';

import Icon from '../../components/ui/Icon';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatDate } from '../../utils/formatDate';

// "Ravi Kumar" → its initials for the avatar; a single name gives one letter.
function initials(name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase();
}

// Riders for one status tab. A row (or Details) opens the rider page, where the other actions live;
// only Terminate stays here, and terminated riders get Details alone.
// readOnly (onboarding users) shows the rows without links or actions: the rider page is not theirs.
export default function RidersTable({ riders, onTerminate, readOnly = false }) {
    const navigate = useNavigate();
    const riderPath = rider => `/riders/${encodeURIComponent(rider.rider_id)}`;

    return (
        <div className="table-wrap">
            <table className={`table table--roomy${readOnly ? '' : ' table--clickable'}`}>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Rider ID</th>
                        <th>Phone</th>
                        <th>Hub</th>
                        <th>Status</th>
                        <th>Created</th>
                        {!readOnly && <th className="actions-col">Actions</th>}
                    </tr>
                </thead>
                <tbody>
                    {riders.map(rider => (
                        <tr key={rider.rider_id} onClick={readOnly ? undefined : () => navigate(riderPath(rider))}>
                            <td>
                                <div className="person">
                                    <span className="avatar">{initials(rider.name)}</span>
                                    <span className="person__name">{rider.name}</span>
                                    {rider.is_test && <span className="badge badge--warning">Test</span>}
                                </div>
                            </td>
                            <td className="mono">{rider.rider_id}</td>
                            <td className="mono">{rider.phone}</td>
                            <td>{rider.hub_name}</td>
                            <td><StatusBadge status={rider.status} /></td>
                            <td className="muted">{formatDate(rider.created_at)}</td>
                            {/* Clicks on the buttons must not also open the row. */}
                            {!readOnly && <td className="actions-col" onClick={event => event.stopPropagation()}>
                                <div className="row-actions">
                                    <Link to={riderPath(rider)} className="pill-button">
                                        <Icon name="eye" size={15} />
                                        Details
                                    </Link>
                                    {rider.status !== 'Terminated' && (
                                        <button
                                            type="button"
                                            className="pill-button pill-button--danger pill-button--icon"
                                            aria-label={`Terminate ${rider.name}`}
                                            title="Terminate"
                                            onClick={() => onTerminate(rider)}
                                        >
                                            <Icon name="userX" size={15} />
                                        </button>
                                    )}
                                </div>
                            </td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
