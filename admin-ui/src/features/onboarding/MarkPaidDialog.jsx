import { useEffect, useRef, useState } from 'react';

import Field from '../../components/ui/Field';
import CurrencyText from '../../components/ui/CurrencyText';
import { PAYMENT_LABELS } from './reviewLabels';

const MAX_REFERENCE_LENGTH = 100;
const MAX_NOTE_LENGTH = 500;

// Admins only: records a payment the rider made that the payment provider never confirmed.
// The reference (UTR, UPI or gateway ID) must not have been used for another payment.
// Mounted only while open. onSubmit({ reference, note }) must return a promise; its rejection is shown here.
export default function MarkPaidDialog({ item, onSubmit, onClose }) {
    const dialogRef = useRef(null);
    const [reference, setReference] = useState('');
    const [note, setNote] = useState('');
    const [referenceError, setReferenceError] = useState(null);
    const [serverError, setServerError] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        dialogRef.current.showModal();
    }, []);

    async function handleSubmit(event) {
        event.preventDefault();

        if (!reference.trim()) {
            setReferenceError('Add the payment reference');
            return;
        }

        setBusy(true);
        setServerError(null);

        try {
            await onSubmit({ reference: reference.trim(), note: note.trim() || undefined });
        } catch (error) {
            // Stay open with the error; on success the parent unmounts this dialog.
            setServerError(error.message);
            setBusy(false);
        }
    }

    function handleCancel(event) {
        event.preventDefault();

        if (!busy) {
            onClose();
        }
    }

    return (
        <dialog ref={dialogRef} className="dialog" onCancel={handleCancel}>
            <form onSubmit={handleSubmit} noValidate>
                <h3 className="dialog__title">Mark {PAYMENT_LABELS[item.purpose].toLowerCase()} as paid</h3>
                <p className="cell-sub">
                    Only when the money has reached our account but the payment was not confirmed automatically.
                    {item.amount !== null && <> Amount: <CurrencyText value={item.amount} />.</>}
                </p>

                {serverError && <p className="form-alert" role="alert">{serverError}</p>}

                <Field label="Payment reference" error={referenceError}>
                    <input
                        type="text"
                        maxLength={MAX_REFERENCE_LENGTH}
                        value={reference}
                        onChange={event => {
                            setReference(event.target.value);
                            setReferenceError(null);
                        }}
                        placeholder="e.g. UTR or UPI reference number"
                        autoFocus
                    />
                </Field>

                <Field label="Note (optional)">
                    <textarea
                        rows={2}
                        maxLength={MAX_NOTE_LENGTH}
                        value={note}
                        onChange={event => setNote(event.target.value)}
                        placeholder="e.g. Paid by UPI at the hub, checked in the bank statement"
                    />
                </Field>

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button" disabled={busy}>
                        {busy ? 'Saving…' : 'Mark paid'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
