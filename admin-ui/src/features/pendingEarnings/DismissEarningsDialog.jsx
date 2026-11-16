import { useEffect, useRef, useState } from 'react';

import Field from '../../components/ui/Field';

const MAX_REASON_LENGTH = 500;

// Set earnings aside with a reason: an unknown ID's pending entries, or a row that failed to import.
// title, details (what is being dismissed) and hint describe it. Mounted only while open.
// onSubmit(reason) must return a promise; its rejection message is shown here.
export default function DismissEarningsDialog({ title, details, hint, placeholder, onSubmit, onClose }) {
    const dialogRef = useRef(null);
    const [reason, setReason] = useState('');
    const [reasonError, setReasonError] = useState(null);
    const [serverError, setServerError] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        dialogRef.current.showModal();
    }, []);

    async function handleSubmit(event) {
        event.preventDefault();

        if (!reason.trim()) {
            setReasonError('Add a reason for dismissing');
            return;
        }

        setBusy(true);
        setServerError(null);

        try {
            await onSubmit(reason.trim());
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
                <h3 className="dialog__title">{title}</h3>
                <p className="cell-sub resolve__record">{details}</p>

                {serverError && <p className="form-alert" role="alert">{serverError}</p>}

                <Field label="Reason" error={reasonError}>
                    <textarea
                        rows={3}
                        maxLength={MAX_REASON_LENGTH}
                        value={reason}
                        onChange={event => {
                            setReason(event.target.value);
                            setReasonError(null);
                        }}
                        placeholder={placeholder}
                        autoFocus
                    />
                </Field>

                <p className="cell-sub">{hint}</p>

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button button--danger" disabled={busy}>
                        {busy ? 'Dismissing…' : 'Dismiss'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
