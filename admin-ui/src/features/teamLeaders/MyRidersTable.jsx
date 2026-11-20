import { Link } from 'react-router-dom';

import CurrencyText from '../../components/ui/CurrencyText';
import Icon from '../../components/ui/Icon';
import StatusBadge from '../../components/ui/StatusBadge';
import { bikeLabel } from '../../utils/bikeLabel';
import { formatWeekRange } from '../../utils/week';

// "Ravi Kumar" → its initials for the avatar; a single name gives one letter.
function initials(name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase();
}

// A team leader's riders. The API sorts riders who owe money first; the phone opens the dialler.
export default function MyRidersTable({ riders }) {
    return (
        <div className="table-wrap">
            <table className="table table--roomy">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Status</th>
                        <th>Bike</th>
                        <th className="num">Owes now</th>
                        <th className="num">Open escalations</th>
                        <th className="actions-col">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {riders.map(rider => (
                        <tr key={rider.riderId}>
                            <td>
                                <div className="person">
                                    <span className="avatar">{initials(rider.name)}</span>
                                    <span>
                                        <span className="person__name">{rider.name}</span>
                                        <span className="person__sub mono">{rider.riderId}</span>
                                    </span>
                                </div>
                            </td>
                            <td className="mono">
                                <a href={`tel:${rider.phone}`}>{rider.phone}</a>
                            </td>
                            <td><StatusBadge status={rider.status} /></td>
                            <td className={rider.currentBike ? 'mono' : 'muted'}>
                                {rider.currentBike ? bikeLabel(rider.currentBike) : 'None'}
                            </td>
                            <td className="num">
                                {rider.outstandingBalance > 0 ? (
                                    <CurrencyText value={-rider.outstandingBalance} />
                                ) : (
                                    <span className="muted">Nothing</span>
                                )}
                                {rider.lastPaidWeek && (
                                    <span className="person__sub">Last paid {formatWeekRange(rider.lastPaidWeek)}</span>
                                )}
                            </td>
                            <td className="num">
                                {rider.openEscalations ? (
                                    <>
                                        <StatusBadge status="Open" /> {rider.openEscalations}
                                        {rider.openEscalationAmount > 0 && (
                                            <span className="person__sub">
                                                <CurrencyText value={rider.openEscalationAmount} />
                                            </span>
                                        )}
                                    </>
                                ) : (
                                    <span className="muted">None</span>
                                )}
                            </td>
                            <td className="actions-col">
                                <div className="row-actions">
                                    <Link to={`/riders/${encodeURIComponent(rider.riderId)}`} className="pill-button">
                                        <Icon name="eye" size={15} />
                                        Details
                                    </Link>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
