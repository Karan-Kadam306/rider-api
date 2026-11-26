import { useEffect, useRef, useState } from 'react';

import Field from '../../components/ui/Field';
import { STEP_LABELS } from './reviewLabels';

const MAX_NOTE_LENGTH = 500;

// Sends steps back to the rider. Steps whose item was rejected are ticked and locked: the API
// always sends them back. Mounted only while open.
// lockedSteps: steps with a rejected item. onSubmit({ steps, note }) must return a promise.
export default function RequestChangesDialog({ lockedSteps, onSubmit, onClose }) {
    const dialogRef = useRef(null);
    const [steps, setSteps] = useState(lockedSteps);
    const [note, setNote] = useState('');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        dialogRef.current.showModal();
    }, []);

    function toggleStep(step) {
        setSteps(current => (current.includes(step) ? current.filter(item => item !== step) : [...current, step]));
        setError(null);
    }

    async function handleSubmit(event) {
        event.preventDefault();

        if (!steps.length) {
            setError('Choose at least one step for the rider to fix');
            return;
        }

        setBusy(true);
        setError(null);

        try {
            await onSubmit({ steps, note: note.trim() || undefined });
        } catch (submitError) {
            // Stay open with the error; on success the parent unmounts this dialog, so busy needs no reset.
            setError(submitError.message);
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
                <h3 className="dialog__title">Send back to the rider</h3>
                <p className="cell-sub">The rider can change only the steps ticked here, then submits again.</p>

                {error && <p className="form-alert" role="alert">{error}</p>}

                <div className="review-steps">
                    {Object.entries(STEP_LABELS).map(([step, label]) => (
                        <label key={step} className="checkbox">
                            <input
                                type="checkbox"
                                checked={steps.includes(step)}
                                disabled={lockedSteps.includes(step)}
                                onChange={() => toggleStep(step)}
                            />
                            {label}
                            {lockedSteps.includes(step) && <span className="muted"> (rejected)</span>}
                        </label>
                    ))}
                </div>

                <Field label="Note for the rider (optional)">
                    <textarea
                        rows={3}
                        maxLength={MAX_NOTE_LENGTH}
                        value={note}
                        onChange={event => setNote(event.target.value)}
                        placeholder="e.g. Please upload a clearer photo of the back of your licence"
                    />
                </Field>

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button" disabled={busy}>
                        {busy ? 'Sending…' : 'Send back'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
