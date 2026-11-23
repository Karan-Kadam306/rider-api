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
export default function RidersTable({ riders, onTerminate }) {
    const navigate = useNavigate();
    const riderPath = rider => `/riders/${encodeURIComponent(rider.rider_id)}`;

    return (
        <div className="table-wrap">
            <table className="table table--roomy table--clickable">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Rider ID</th>
                        <th>Phone</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th className="actions-col">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {riders.map(rider => (
                        <tr key={rider.rider_id} onClick={() => navigate(riderPath(rider))}>
                            <td>
                                <div className="person">
                                    <span className="avatar">{initials(rider.name)}</span>
                                    <span className="person__name">{rider.name}</span>
                                </div>
                            </td>
                            <td className="mono">{rider.rider_id}</td>
                            <td className="mono">{rider.phone}</td>
                            <td><StatusBadge status={rider.status} /></td>
                            <td className="muted">{formatDate(rider.created_at)}</td>
                            {/* Clicks on the buttons must not also open the row. */}
                            <td className="actions-col" onClick={event => event.stopPropagation()}>
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
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
