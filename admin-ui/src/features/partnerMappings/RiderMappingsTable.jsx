import { Fragment } from 'react';

import Icon from '../../components/ui/Icon';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatDate } from '../../utils/formatDate';
import MappingEditor from './MappingEditor';

const COLUMN_COUNT = 6;

// Riders for one tab. The open rider's row expands into the mapping editor below it.
export default function RiderMappingsTable({ riders, partners, openRiderId, onToggle, onSave }) {
    return (
        <div className="table-wrap">
            <table className="table table--roomy">
                <thead>
                    <tr>
                        <th>Rider</th>
                        <th>Phone</th>
                        <th>Status</th>
                        <th>Partners</th>
                        <th>Last mapped</th>
                        <th className="actions-col">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {riders.map(rider => {
                        const isOpen = rider.riderId === openRiderId;

                        return (
                            <Fragment key={rider.riderId}>
                                <tr className={isOpen ? 'table-row--open' : undefined}>
                                    <td>
                                        <span className="person__name">{rider.name}</span>
                                        <div className="cell-sub mono">{rider.riderId}</div>
                                    </td>
                                    <td className="mono">{rider.phone}</td>
                                    <td><StatusBadge status={rider.status} /></td>
                                    <td>
                                        {rider.mappings.length ? (
                                            <div className="mapping-chips">
                                                {rider.mappings.map(mapping => (
                                                    <span key={mapping.partnerId} className="mapping-chip">
                                                        {mapping.partnerName}
                                                        <span className="mono">{mapping.partnerRiderId}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="muted">—</span>
                                        )}
                                    </td>
                                    <td className="muted nowrap">
                                        {rider.lastMappedAt ? formatDate(rider.lastMappedAt) : '—'}
                                    </td>
                                    <td className="actions-col">
                                        <button
                                            type="button"
                                            className="pill-button"
                                            aria-expanded={isOpen}
                                            onClick={() => onToggle(rider.riderId)}
                                        >
                                            <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={15} />
                                            {rider.mappings.length ? 'Edit mappings' : 'Map partners'}
                                        </button>
                                    </td>
                                </tr>
                                {isOpen && (
                                    <tr className="mapping-editor-row">
                                        <td colSpan={COLUMN_COUNT}>
                                            <MappingEditor
                                                rider={rider}
                                                partners={partners}
                                                onSave={mappings => onSave(rider, mappings)}
                                                onCancel={() => onToggle(rider.riderId)}
                                            />
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
