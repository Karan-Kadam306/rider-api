import Icon from '../../components/ui/Icon';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatDate } from '../../utils/formatDate';

// Every hub with its bikes. Deactivating a hub that still has bikes is refused by the API,
// and the page shows its message.
export default function HubsTable({ hubs, onEdit, onToggleActive }) {
    return (
        <div className="table-wrap">
            <table className="table table--roomy">
                <thead>
                    <tr>
                        <th>Hub</th>
                        <th>City</th>
                        <th>Manager</th>
                        <th>Bikes</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th className="actions-col">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {hubs.map(hub => (
                        <tr key={hub.hubId}>
                            <td>
                                <div className="person__name">{hub.name} <span className="mono muted">{hub.code}</span></div>
                                <div className="cell-sub">{hub.address}</div>
                            </td>
                            <td>{hub.city}</td>
                            <td>
                                {hub.managerName ?? <span className="muted">No manager</span>}
                                <div className="cell-sub mono">{hub.contactPhone ?? '—'}</div>
                            </td>
                            <td>
                                {hub.totalBikes}
                                <div className="cell-sub">{hub.availableBikes} available</div>
                            </td>
                            <td><StatusBadge status={hub.isActive ? 'Active' : 'Inactive'} /></td>
                            <td className="muted">{formatDate(hub.createdAt)}</td>
                            <td className="actions-col">
                                <div className="row-actions">
                                    <button type="button" className="pill-button" onClick={() => onEdit(hub)}>
                                        <Icon name="edit" size={15} />
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        className={`pill-button${hub.isActive ? ' pill-button--danger' : ''}`}
                                        onClick={() => onToggleActive(hub)}
                                    >
                                        <Icon name={hub.isActive ? 'close' : 'circleCheck'} size={15} />
                                        {hub.isActive ? 'Deactivate' : 'Activate'}
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
