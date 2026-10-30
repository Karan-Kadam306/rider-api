import Icon from '../../components/ui/Icon';
import StatusBadge from '../../components/ui/StatusBadge';

const createdFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function initials(name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase();
}

// Riders for one status tab. Terminated riders are read-only.
export default function RidersTable({ riders, onEdit, onToggleStatus, onTerminate }) {
    return (
        <div className="table-wrap">
            <table className="table table--roomy">
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
                        <tr key={rider.rider_id}>
                            <td>
                                <div className="person">
                                    <span className="avatar">{initials(rider.name)}</span>
                                    <span className="person__name">{rider.name}</span>
                                </div>
                            </td>
                            <td className="mono">{rider.rider_id}</td>
                            <td className="mono">{rider.phone}</td>
                            <td><StatusBadge status={rider.status} /></td>
                            <td className="muted">{createdFormat.format(new Date(rider.created_at))}</td>
                            <td className="actions-col">
                                {rider.status === 'Terminated' ? (
                                    <span className="muted">No actions</span>
                                ) : (
                                    <div className="row-actions">
                                        <button type="button" className="pill-button" onClick={() => onEdit(rider)}>
                                            <Icon name="edit" size={15} />
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            className="pill-button"
                                            onClick={() => onToggleStatus(rider)}
                                        >
                                            <Icon name={rider.status === 'Active' ? 'userPause' : 'userCheck'} size={15} />
                                            {rider.status === 'Active' ? 'Deactivate' : 'Activate'}
                                        </button>
                                        <button
                                            type="button"
                                            className="pill-button pill-button--danger"
                                            onClick={() => onTerminate(rider)}
                                        >
                                            <Icon name="userX" size={15} />
                                            Terminate
                                        </button>
                                    </div>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
