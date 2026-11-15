import { useEffect, useRef, useState } from 'react';

import Field from '../../components/ui/Field';

// Mark as paid, Waive or Close: each needs one line of text (a payment reference, a reason or a note).
// Mounted only while open. onSubmit(text) must return a promise; its rejection message is shown.
export default function EscalationActionDialog({ title, label, placeholder, confirmLabel, onSubmit, onClose }) {
    const dialogRef = useRef(null);
    const [text, setText] = useState('');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        dialogRef.current.showModal();
    }, []);

    async function handleSubmit(event) {
        event.preventDefault();

        if (!text.trim()) {
            setError(`${label} is required`);
            return;
        }

        setBusy(true);
        setError(null);

        try {
            await onSubmit(text.trim());
        } catch (submitError) {
            setError(submitError.message);
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
                <h3 className="dialog__title">{title}</h3>

                <div className="form-fields">
                    <Field label={label} error={error}>
                        <input
                            value={text}
                            onChange={event => setText(event.target.value)}
                            maxLength={200}
                            placeholder={placeholder}
                            autoFocus
                        />
                    </Field>
                </div>

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button" disabled={busy}>
                        {busy ? 'Saving…' : confirmLabel}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
