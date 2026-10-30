import { useEffect, useRef } from 'react';

// Native <dialog> gives focus trapping and Escape-to-close for free.
export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    busy = false,
    onConfirm,
    onCancel
}) {
    const dialogRef = useRef(null);

    useEffect(() => {
        const dialog = dialogRef.current;

        if (open && !dialog.open) {
            dialog.showModal();
        } else if (!open && dialog.open) {
            dialog.close();
        }
    }, [open]);

    function handleCancel(event) {
        // Escape key; ignore it while the action is running.
        event.preventDefault();

        if (!busy) {
            onCancel();
        }
    }

    return (
        <dialog ref={dialogRef} className="dialog" onCancel={handleCancel}>
            <h3 className="dialog__title">{title}</h3>
            <div className="dialog__message">{message}</div>
            <div className="dialog__actions">
                <button type="button" className="button button--secondary" disabled={busy} onClick={onCancel}>
                    Cancel
                </button>
                <button type="button" className="button button--danger" disabled={busy} onClick={onConfirm}>
                    {busy ? 'Working…' : confirmLabel}
                </button>
            </div>
        </dialog>
    );
}
