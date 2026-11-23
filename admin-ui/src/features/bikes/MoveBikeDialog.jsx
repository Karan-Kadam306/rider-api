import { useEffect, useRef, useState } from 'react';

import Field from '../../components/ui/Field';
import { bikeLabel } from '../../utils/bikeLabel';

// Move a bike that is not assigned to another active hub. Mounted only while open.
// hubs: the active hubs. onSubmit(hubId) must return a promise; its rejection message is shown.
export default function MoveBikeDialog({ bike, hubs, onSubmit, onClose }) {
    const dialogRef = useRef(null);
    const targets = hubs.filter(hub => hub.hubId !== bike.hub.hubId);
    const [hubId, setHubId] = useState(targets[0]?.hubId ?? '');
    const [serverError, setServerError] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        dialogRef.current.showModal();
    }, []);

    async function handleSubmit(event) {
        event.preventDefault();
        setBusy(true);
        setServerError(null);

        try {
            await onSubmit(Number(hubId));
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
                <h3 className="dialog__title">Move {bikeLabel(bike)}</h3>
                <p className="muted">Now at {bike.hub.name}.</p>

                {serverError && <p className="form-alert" role="alert">{serverError}</p>}

                {targets.length ? (
                    <div className="form-fields">
                        <Field label="Move to">
                            <select value={hubId} onChange={event => setHubId(event.target.value)}>
                                {targets.map(hub => (
                                    <option key={hub.hubId} value={hub.hubId}>{hub.name} · {hub.city}</option>
                                ))}
                            </select>
                        </Field>
                    </div>
                ) : (
                    <p className="form-note muted">There is no other active hub. Add one on Hub Management first.</p>
                )}

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button" disabled={busy || !targets.length}>
                        {busy ? 'Moving…' : 'Move bike'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
