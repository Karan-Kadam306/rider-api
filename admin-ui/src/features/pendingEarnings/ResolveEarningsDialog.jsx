import { useEffect, useRef, useState } from 'react';

import { getRiders } from '../../api/ridersApi';
import { useApi } from '../../hooks/useApi';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import CurrencyText from '../../components/ui/CurrencyText';
import Icon from '../../components/ui/Icon';

// Keeps the picker short; the user types to narrow down further.
const RESULT_LIMIT = 8;

// Pick the rider an unknown partner ID belongs to. Mounted only while open.
// The search starts with the name from the sheet, the best clue to who this is.
// Any rider can be picked, terminated ones too, since late earnings still belong to them.
// onSubmit(rider) must return a promise; its rejection message is shown here.
export default function ResolveEarningsDialog({ group, onSubmit, onClose }) {
    const dialogRef = useRef(null);
    const [query, setQuery] = useState(group.nameInFile ?? '');
    const [selected, setSelected] = useState(null);
    const [serverError, setServerError] = useState(null);
    const [busy, setBusy] = useState(false);

    const search = useDebouncedValue(query.trim());
    const riders = useApi(
        options => getRiders({ search: search || undefined, limit: RESULT_LIMIT }, options),
        [search]
    );

    useEffect(() => {
        dialogRef.current.showModal();
    }, []);

    async function handleSubmit(event) {
        event.preventDefault();
        setBusy(true);
        setServerError(null);

        try {
            await onSubmit(selected);
        } catch (error) {
            // Stay open with the error; on success the parent unmounts this dialog, so busy needs no reset.
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
                <h3 className="dialog__title">Resolve {group.partnerName} ID</h3>
                <p className="cell-sub resolve__record">
                    <span className="mono">{group.partnerRiderId}</span> · {group.entries} {group.entries === 1 ? 'entry' : 'entries'} · <CurrencyText value={group.totalAmount} />
                </p>

                {serverError && <p className="form-alert" role="alert">{serverError}</p>}

                <div className="search-box search-box--compact">
                    <Icon name="search" size={16} />
                    <input
                        type="search"
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="Search riders by name, phone or ID…"
                        aria-label="Search riders"
                        autoFocus
                    />
                </div>

                <div className="picker-list" role="listbox" aria-label="Riders">
                    {riders.loading && <p className="muted picker-list__note">Loading riders…</p>}
                    {riders.error && <p className="field__error picker-list__note">{riders.error.message}</p>}
                    {riders.data && !riders.data.riders.length && (
                        <p className="muted picker-list__note">No riders found. Try part of the name or the phone number.</p>
                    )}
                    {riders.data?.riders.map(rider => (
                        <button
                            key={rider.rider_id}
                            type="button"
                            role="option"
                            aria-selected={selected?.rider_id === rider.rider_id}
                            className={`picker-option${selected?.rider_id === rider.rider_id ? ' picker-option--selected' : ''}`}
                            onClick={() => {
                                setSelected(rider);
                                setServerError(null);
                            }}
                        >
                            <span className="person__name">{rider.name}</span>
                            <span className="cell-sub">{rider.rider_id} · {rider.phone} · {rider.status}</span>
                        </button>
                    ))}
                </div>

                <p className="cell-sub">
                    The ID is mapped to this rider, and every pending entry for it moves to them.
                </p>

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button" disabled={busy || !selected}>
                        {busy ? 'Saving…' : selected ? `Map to ${selected.name}` : 'Select a rider'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
