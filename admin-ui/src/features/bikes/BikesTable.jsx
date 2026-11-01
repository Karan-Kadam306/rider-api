import Icon from '../../components/ui/Icon';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatDate } from '../../utils/formatDate';

// Which actions a bike offers depends on its status:
// Available → assign or send to maintenance; Assigned → return; Maintenance → mark available.
export default function BikesTable({ bikes, onAssign, onReturn, onChangeStatus, onShowHistory }) {
    return (
        <div className="table-wrap">
            <table className="table table--roomy">
                <thead>
                    <tr>
                        <th>Bike ID</th>
                        <th>Registration</th>
                        <th>Chassis no.</th>
                        <th>Status</th>
                        <th>Current rider</th>
                        <th>Created</th>
                        <th className="actions-col">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {bikes.map(bike => (
                        <tr key={bike.bikeId}>
                            <td className="mono">#{bike.bikeId}</td>
                            <td className="person__name">{bike.registrationNumber ?? <span className="muted">—</span>}</td>
                            <td className="mono">{bike.chassisNumber}</td>
                            <td><StatusBadge status={bike.status} /></td>
                            <td>
                                {bike.currentRider ? (
                                    <>
                                        <div className="person__name">{bike.currentRider.name}</div>
                                        <div className="cell-sub">since {formatDate(bike.currentRider.assignedAt)}</div>
                                    </>
                                ) : (
                                    <span className="muted">Not assigned</span>
                                )}
                            </td>
                            <td className="muted">{formatDate(bike.createdAt)}</td>
                            <td className="actions-col">
                                <div className="row-actions">
                                    {bike.status === 'Available' && (
                                        <>
                                            <button type="button" className="pill-button" onClick={() => onAssign(bike)}>
                                                <Icon name="userCheck" size={15} />
                                                Assign
                                            </button>
                                            <button
                                                type="button"
                                                className="pill-button"
                                                onClick={() => onChangeStatus(bike, 'Maintenance')}
                                            >
                                                <Icon name="wrench" size={15} />
                                                Maintenance
                                            </button>
                                        </>
                                    )}
                                    {bike.status === 'Assigned' && (
                                        <button type="button" className="pill-button" onClick={() => onReturn(bike)}>
                                            <Icon name="undo" size={15} />
                                            Return
                                        </button>
                                    )}
                                    {bike.status === 'Maintenance' && (
                                        <button
                                            type="button"
                                            className="pill-button"
                                            onClick={() => onChangeStatus(bike, 'Available')}
                                        >
                                            <Icon name="circleCheck" size={15} />
                                            Mark available
                                        </button>
                                    )}
                                    <button type="button" className="pill-button" onClick={() => onShowHistory(bike)}>
                                        <Icon name="clock" size={15} />
                                        History
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
