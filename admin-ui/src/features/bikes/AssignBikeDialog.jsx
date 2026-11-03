import { useEffect, useRef, useState } from 'react';

import { getRiders } from '../../api/ridersApi';
import { useApi } from '../../hooks/useApi';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import Icon from '../../components/ui/Icon';
import { bikeLabel } from '../../utils/bikeLabel';

const RESULT_LIMIT = 8;

function newIdempotencyKey() {
    return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Pick an Active rider for an Available bike. Mounted only while open.
// onSubmit({ rider, idempotencyKey }) must return a promise; its rejection message is shown here.
export default function AssignBikeDialog({ bike, onSubmit, onClose }) {
    const dialogRef = useRef(null);
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(null);
    // One key per chosen rider: a retry for the same rider reuses it (so it can't assign twice),
    // while picking another rider gets a fresh one (the backend rejects a key reused with new data).
    const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
    const [serverError, setServerError] = useState(null);
    const [busy, setBusy] = useState(false);

    const search = useDebouncedValue(query.trim());
    const riders = useApi(
        options => getRiders({ status: 'Active', search, limit: RESULT_LIMIT }, options),
        [search]
    );

    useEffect(() => {
        dialogRef.current.showModal();
    }, []);

    function selectRider(rider) {
        if (rider.rider_id !== selected?.rider_id) {
            setSelected(rider);
            setIdempotencyKey(newIdempotencyKey());
            setServerError(null);
        }
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setBusy(true);
        setServerError(null);

        try {
            await onSubmit({ rider: selected, idempotencyKey });
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


    return (
        <dialog ref={dialogRef} className="dialog" onCancel={handleCancel}>
            <form onSubmit={handleSubmit}>
                <h3 className="dialog__title">Assign {bikeLabel(bike)}</h3>

                {serverError && <p className="form-alert" role="alert">{serverError}</p>}

                <div className="search-box search-box--compact">
                    <Icon name="search" size={16} />
                    <input
                        type="search"
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="Search active riders by name, phone or ID…"
                        aria-label="Search riders"
                        autoFocus
                    />
                </div>

                <div className="picker-list" role="listbox" aria-label="Riders">
                    {riders.loading && <p className="muted picker-list__note">Loading riders…</p>}
                    {riders.error && <p className="field__error picker-list__note">{riders.error.message}</p>}
                    {riders.data && !riders.data.riders.length && (
                        <p className="muted picker-list__note">No active riders found.</p>
                    )}
                    {riders.data?.riders.map(rider => (
                        <button
                            key={rider.rider_id}
                            type="button"
                            role="option"
                            aria-selected={selected?.rider_id === rider.rider_id}
                            className={`picker-option${selected?.rider_id === rider.rider_id ? ' picker-option--selected' : ''}`}
                            onClick={() => selectRider(rider)}
                        >
                            <span className="person__name">{rider.name}</span>
                            <span className="cell-sub">{rider.rider_id} · {rider.phone}</span>
                        </button>
                    ))}
                </div>
                {riders.data && riders.data.pagination.totalRecords > RESULT_LIMIT && (
                    <p className="cell-sub">Showing {RESULT_LIMIT} of {riders.data.pagination.totalRecords}. Type to narrow down.</p>
                )}

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button" disabled={busy || !selected}>
                        {busy ? 'Assigning…' : selected ? `Assign to ${selected.name}` : 'Select a rider'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
