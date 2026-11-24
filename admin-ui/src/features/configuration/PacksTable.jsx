import CurrencyText from '../../components/ui/CurrencyText';
import Icon from '../../components/ui/Icon';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatNumber } from '../../utils/formatCurrency';

const KIND_LABELS = { Weekly: 'Weekly pack', TopUp: 'KM top-up' };

// Prepaid packs, weekly packs first. Inactive packs cannot be bought.
export default function PacksTable({ packs, onEdit, onToggleActive }) {
    return (
        <div className="table-wrap">
            <table className="table">
                <thead>
                    <tr>
                        <th>Pack</th>
                        <th>Type</th>
                        <th className="num">Price</th>
                        <th className="num">KM</th>
                        <th>Valid for</th>
                        <th>Status</th>
                        <th className="actions-col">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {packs.map(pack => (
                        <tr key={pack.packId}>
                            <td className="person__name">{pack.name}</td>
                            <td>{KIND_LABELS[pack.kind]}</td>
                            <td className="num"><CurrencyText value={pack.price} /></td>
                            <td className="num">{formatNumber(pack.kmIncluded)}</td>
                            <td>{pack.validityDays} day{pack.validityDays === 1 ? '' : 's'}</td>
                            <td><StatusBadge status={pack.isActive ? 'Active' : 'Inactive'} /></td>
                            <td className="actions-col">
                                <div className="row-actions">
                                    <button type="button" className="pill-button" onClick={() => onEdit(pack)}>
                                        <Icon name="edit" size={15} />
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        className={`pill-button${pack.isActive ? ' pill-button--danger' : ''}`}
                                        onClick={() => onToggleActive(pack)}
                                    >
                                        <Icon name={pack.isActive ? 'close' : 'circleCheck'} size={15} />
                                        {pack.isActive ? 'Deactivate' : 'Activate'}
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
