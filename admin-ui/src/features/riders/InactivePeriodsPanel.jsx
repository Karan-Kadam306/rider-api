import { useEffect, useRef, useState } from 'react';

import {
    addInactivePeriod,
    approveInactivePeriod,
    getInactivePeriods,
    removeInactivePeriod
} from '../../api/ridersApi';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import Icon from '../../components/ui/Icon';
import Field from '../../components/ui/Field';
import StatusBadge from '../../components/ui/StatusBadge';
import ErrorState from '../../components/feedback/ErrorState';
import { formatDate } from '../../utils/formatDate';
import { todayInIst } from '../../utils/week';

// Both ends count, so a period that starts and ends on the same date is 1 day.
function dayCount(startDate, endDate) {
    const days = (new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / 86400000 + 1;
    return `${days} day${days === 1 ? '' : 's'}`;
}

// Side panel for a rider's inactive periods. Approved days are not charged rental,
// even if a bike was assigned; pending ones still are. Mounted only while open.
export default function InactivePeriodsPanel({ rider, onClose }) {
    const dialogRef = useRef(null);
    const showToast = useToast();
    const [reloadKey, setReloadKey] = useState(0);
    const [startDate, setStartDate] = useState(todayInIst);
    const [endDate, setEndDate] = useState(todayInIst);
    const [formError, setFormError] = useState(null);
    // 'add', or the ID of the period being changed, so only that row's buttons are disabled.
    const [busyId, setBusyId] = useState(null);

    const list = useApi(options => getInactivePeriods(rider.rider_id, options), [rider.rider_id, reloadKey]);
    const reload = () => setReloadKey(key => key + 1);

    useEffect(() => {
        dialogRef.current.showModal();
    }, []);

    function handleCancel(event) {
        // Escape key: close through the parent, which unmounts this panel.
        event.preventDefault();
        onClose();
    }

    async function handleAdd(event) {
        event.preventDefault();

        // YYYY-MM-DD strings sort like dates, so a plain comparison is enough.
        if (endDate < startDate) {
            setFormError('The end date cannot be before the start date.');
            return;
        }

        setBusyId('add');
        setFormError(null);

        try {
            await addInactivePeriod(rider.rider_id, { startDate, endDate });
            showToast({ message: `Inactive period added for ${rider.name}; approve it to stop rental for those days` });
            reload();
        } catch (error) {
            setFormError(error.message);
        } finally {
            setBusyId(null);
        }
    }

    async function runAction(period, action) {
        setBusyId(period.periodId);

        try {
            if (action === 'approve') {
                await approveInactivePeriod(rider.rider_id, period.periodId);
                showToast({ message: `Approved: no rental from ${formatDate(period.startDate)} to ${formatDate(period.endDate)}` });
            } else {
                await removeInactivePeriod(rider.rider_id, period.periodId);
                showToast({ message: 'Inactive period removed' });
            }

            reload();
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        } finally {
            setBusyId(null);
        }
    }

    // A terminated rider cannot get new periods; existing ones are still listed.
    const canAdd = rider.status !== 'Terminated';

    return (
        <dialog ref={dialogRef} className="drawer drawer--wide" onCancel={handleCancel} aria-labelledby="inactive-periods-title">
            <div className="drawer__header">
                <div>
                    <h3 id="inactive-periods-title" className="dialog__title">Inactive days</h3>
                    <p className="cell-sub">{rider.name} · {rider.rider_id}</p>
                </div>
                <button type="button" className="button button--icon" aria-label="Close" onClick={onClose}>
                    <Icon name="close" size={16} />
                </button>
            </div>

            <div className="drawer__body">
                <div className="form-fields">
                    <p className="muted">
                        Approved days are not charged rental, even if a bike was assigned. Pending days are still
                        charged until approved. Days without a bike are never charged.
                    </p>

                    {canAdd && (
                        <form className="inactive-form" onSubmit={handleAdd} noValidate>
                            <Field label="From">
                                <input type="date" value={startDate} required onChange={event => setStartDate(event.target.value)} />
                            </Field>
                            <Field label="To">
                                <input type="date" value={endDate} required onChange={event => setEndDate(event.target.value)} />
                            </Field>
                            <button type="submit" className="button" disabled={busyId === 'add' || !startDate || !endDate}>
                                <Icon name="plus" size={16} />
                                {busyId === 'add' ? 'Adding…' : 'Add period'}
                            </button>
                        </form>
                    )}

                    {formError && <p className="form-alert" role="alert">{formError}</p>}

                    {list.loading && <p className="muted">Loading inactive periods…</p>}

                    {list.error && <ErrorState title="Could not load inactive periods" error={list.error} onRetry={list.retry} />}

                    {list.data && (list.data.length ? (
                        <div className="table-wrap">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Dates</th>
                                        <th>Status</th>
                                        <th className="actions-col">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {list.data.map(period => (
                                        <tr key={period.periodId}>
                                            <td>
                                                <div className="nowrap">
                                                    {formatDate(period.startDate)} – {formatDate(period.endDate)}
                                                </div>
                                                <div className="cell-sub">{dayCount(period.startDate, period.endDate)}</div>
                                            </td>
                                            <td><StatusBadge status={period.approved ? 'Approved' : 'Pending'} /></td>
                                            <td className="actions-col">
                                                <div className="row-actions">
                                                    {!period.approved && (
                                                        <button
                                                            type="button"
                                                            className="pill-button"
                                                            disabled={busyId === period.periodId}
                                                            onClick={() => runAction(period, 'approve')}
                                                        >
                                                            <Icon name="circleCheck" size={15} />
                                                            Approve
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        className="pill-button pill-button--danger"
                                                        disabled={busyId === period.periodId}
                                                        onClick={() => runAction(period, 'remove')}
                                                    >
                                                        <Icon name="close" size={15} />
                                                        Remove
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="muted">No inactive periods for this rider.</p>
                    ))}
                </div>
            </div>
        </dialog>
    );
}
