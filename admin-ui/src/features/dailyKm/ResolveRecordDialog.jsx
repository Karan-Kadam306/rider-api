import { useEffect, useRef, useState } from 'react';

import { getBikes } from '../../api/bikesApi';
import { getRiderCandidates } from '../../api/dailyKmApi';
import { useApi } from '../../hooks/useApi';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import Field from '../../components/ui/Field';
import Icon from '../../components/ui/Icon';
import { formatDate, formatDateTime } from '../../utils/formatDate';

const BIKE_RESULT_LIMIT = 8;

function bikeLabel(bike) {
    return bike.registrationNumber ?? `Bike #${bike.bikeId}`;
}

// Choose who is billed for a Needs Review record. Mounted only while open.
// A matched VIN already fixes the bike; an unmatched one needs a bike picked first.
// Only riders who held that bike on the usage date are offered (the backend enforces the same rule).
// onSubmit({ riderId, bikeId, reason }) must return a promise; its rejection message is shown here.
export default function ResolveRecordDialog({ record, onSubmit, onClose }) {
    const dialogRef = useRef(null);
    const needsBike = record.bike_id === null;

    const [bikeQuery, setBikeQuery] = useState(record.reported_vin);
    const [selectedBike, setSelectedBike] = useState(null);
    const [riderId, setRiderId] = useState(null);
    const [reason, setReason] = useState('');
    const [reasonError, setReasonError] = useState(null);
    const [serverError, setServerError] = useState(null);
    const [busy, setBusy] = useState(false);

    const bikeSearch = useDebouncedValue(bikeQuery.trim());
    const bikes = useApi(
        options => (needsBike
            ? getBikes({ search: bikeSearch || undefined, limit: BIKE_RESULT_LIMIT }, options)
            : Promise.resolve(null)),
        [needsBike, bikeSearch]
    );

    const bikeId = needsBike ? selectedBike?.bikeId : Number(record.bike_id);
    const candidates = useApi(
        options => (bikeId
            ? getRiderCandidates({ bikeId, usageDate: record.usage_date }, options)
            : Promise.resolve(null)),
        [bikeId, record.usage_date]
    );

    useEffect(() => {
        dialogRef.current.showModal();
    }, []);

    function selectBike(bike) {
        setSelectedBike(bike);
        setRiderId(null);
        setServerError(null);
    }

    async function handleSubmit(event) {
        event.preventDefault();

        if (!reason.trim()) {
            setReasonError('Add a short reason for this decision');
            return;
        }

        setBusy(true);
        setServerError(null);

        try {
            await onSubmit({
                riderId,
                // The backend only accepts bikeId for an unmatched VIN.
                bikeId: needsBike ? bikeId : undefined,
                reason: reason.trim()
            });
        } catch (error) {
            setServerError(error.message);
            setBusy(false);
        }
    }

    function handleCancel(event) {
        // Escape key; ignore it while saving.
        event.preventDefault();

        if (!busy) {
            onClose();
        }
    }

    const riders = candidates.data?.riders ?? [];

    return (
        <dialog ref={dialogRef} className="dialog" onCancel={handleCancel}>
            <form onSubmit={handleSubmit} noValidate>
                <h3 className="dialog__title">Resolve Daily KM record</h3>
                <p className="cell-sub resolve__record">
                    <span className="mono">{record.reported_vin}</span> · {formatDate(record.usage_date)} · {Number(record.daily_km)} km
                </p>

                {serverError && <p className="form-alert" role="alert">{serverError}</p>}

                <div className="form-fields">
                    {needsBike && (
                        <div>
                            <p className="field__label">1. Which bike is this VIN?</p>
                            <div className="search-box search-box--compact">
                                <Icon name="search" size={16} />
                                <input
                                    type="search"
                                    value={bikeQuery}
                                    onChange={event => setBikeQuery(event.target.value)}
                                    placeholder="Search by registration or chassis number…"
                                    aria-label="Search bikes"
                                />
                            </div>
                            <div className="picker-list" role="listbox" aria-label="Bikes">
                                {bikes.loading && <p className="muted picker-list__note">Loading bikes…</p>}
                                {bikes.error && <p className="field__error picker-list__note">{bikes.error.message}</p>}
                                {bikes.data && !bikes.data.bikes.length && (
                                    <p className="muted picker-list__note">No bikes match. Try part of the chassis number.</p>
                                )}
                                {bikes.data?.bikes.map(bike => (
                                    <button
                                        key={bike.bikeId}
                                        type="button"
                                        role="option"
                                        aria-selected={selectedBike?.bikeId === bike.bikeId}
                                        className={`picker-option${selectedBike?.bikeId === bike.bikeId ? ' picker-option--selected' : ''}`}
                                        onClick={() => selectBike(bike)}
                                    >
                                        <span className="person__name">{bikeLabel(bike)}</span>
                                        <span className="cell-sub mono">{bike.chassisNumber}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {bikeId && (
                        <div>
                            <p className="field__label">{needsBike ? '2. ' : ''}Who should be billed?</p>
                            <div className="picker-list" role="listbox" aria-label="Riders">
                                {candidates.loading && <p className="muted picker-list__note">Loading riders…</p>}
                                {candidates.error && <p className="field__error picker-list__note">{candidates.error.message}</p>}
                                {candidates.data && !riders.length && (
                                    <p className="muted picker-list__note">
                                        Nobody held this bike on {formatDate(record.usage_date)}. Fix the assignment history in Bike Management first.
                                    </p>
                                )}
                                {riders.map(rider => (
                                    <button
                                        key={`${rider.riderId}-${rider.assignedAt}`}
                                        type="button"
                                        role="option"
                                        aria-selected={riderId === rider.riderId}
                                        className={`picker-option${riderId === rider.riderId ? ' picker-option--selected' : ''}`}
                                        onClick={() => setRiderId(rider.riderId)}
                                    >
                                        <span className="person__name">{rider.riderName}</span>
                                        <span className="cell-sub">
                                            {rider.riderId} · {formatDateTime(rider.assignedAt)} → {rider.returnedAt ? formatDateTime(rider.returnedAt) : 'now'}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <Field label="Reason" error={reasonError}>
                        <textarea
                            rows={2}
                            value={reason}
                            onChange={event => {
                                setReason(event.target.value);
                                setReasonError(null);
                            }}
                            placeholder="e.g. Bike handed over at noon; morning rider confirmed the KM"
                        />
                    </Field>
                </div>

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button" disabled={busy || !riderId}>
                        {busy ? 'Saving…' : 'Resolve and validate'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
