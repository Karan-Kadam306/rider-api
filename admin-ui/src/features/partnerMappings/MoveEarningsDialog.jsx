import { useEffect, useRef, useState } from 'react';

import { previewMoveEarnings } from '../../api/partnersApi';
import { useApi } from '../../hooks/useApi';
import CurrencyText from '../../components/ui/CurrencyText';
import Field from '../../components/ui/Field';
import { todayInIst } from '../../utils/week';

// Admins only: give earnings that were matched to the wrong rider to this rider, who holds the ID now.
// The preview lists whose earnings move before anything is saved. Mounted only while open.
// onSubmit(move) must return a promise; its rejection message is shown here.
export default function MoveEarningsDialog({ rider, onSubmit, onClose }) {
    const dialogRef = useRef(null);
    const [mappingIndex, setMappingIndex] = useState(0);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState(todayInIst());
    const [serverError, setServerError] = useState(null);
    const [busy, setBusy] = useState(false);

    const mapping = rider.mappings[mappingIndex];
    const move = {
        partnerId: mapping.partnerId,
        partnerRiderId: mapping.partnerRiderId,
        riderId: rider.riderId,
        fromDate,
        toDate
    };
    const datesReady = Boolean(fromDate && toDate && fromDate <= toDate);

    const preview = useApi(
        options => (datesReady ? previewMoveEarnings(move, options) : Promise.resolve(null)),
        [mapping.partnerId, mapping.partnerRiderId, fromDate, toDate]
    );
    const fromRiders = preview.data?.riders ?? [];
    const entries = fromRiders.reduce((sum, item) => sum + item.entries, 0);

    useEffect(() => {
        dialogRef.current.showModal();
    }, []);

    async function handleSubmit(event) {
        event.preventDefault();
        setBusy(true);
        setServerError(null);

        try {
            await onSubmit(move);
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
            <form onSubmit={handleSubmit} noValidate>
                <h3 className="dialog__title">Move earnings to {rider.name}</h3>

                {serverError && <p className="form-alert" role="alert">{serverError}</p>}

                <div className="form-fields">
                    <Field label="Partner ID">
                        <select value={mappingIndex} onChange={event => setMappingIndex(Number(event.target.value))}>
                            {rider.mappings.map((item, index) => (
                                <option key={item.partnerId} value={index}>{item.partnerName} · {item.partnerRiderId}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="From">
                        <input type="date" value={fromDate} max={toDate} onChange={event => setFromDate(event.target.value)} />
                    </Field>
                    <Field label="To">
                        <input type="date" value={toDate} min={fromDate} onChange={event => setToDate(event.target.value)} />
                    </Field>
                </div>

                <div className="picker-list">
                    {!datesReady && <p className="muted picker-list__note">Choose the dates to see what moves.</p>}
                    {datesReady && preview.loading && <p className="muted picker-list__note">Checking earnings…</p>}
                    {preview.error && <p className="field__error picker-list__note">{preview.error.message}</p>}
                    {preview.data && !fromRiders.length && (
                        <p className="muted picker-list__note">No earnings of this ID are with other riders in these dates.</p>
                    )}
                    {fromRiders.map(item => (
                        <div key={item.riderId} className="picker-option">
                            <span className="person__name">From {item.riderName}</span>
                            <span className="cell-sub">
                                {item.riderId} · {item.entries} {item.entries === 1 ? 'entry' : 'entries'} · <CurrencyText value={item.totalAmount} />
                            </span>
                        </div>
                    ))}
                </div>

                <p className="cell-sub">
                    Paid weeks show the change on Payouts, ready for a payout re-run.
                </p>

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button" disabled={busy || entries === 0}>
                        {busy ? 'Moving…' : `Move ${entries} ${entries === 1 ? 'entry' : 'entries'}`}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
