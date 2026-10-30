import { useEffect, useRef, useState } from 'react';

import { validateRiderForm } from './validateRiderForm';

// Add or edit a rider. Mounted only while open, so each opening starts fresh.
// rider: null to add a new rider, or the rider being edited.
// onSubmit(values) must return a promise; its rejection message is shown in the form.
export default function RiderFormDialog({ rider, onSubmit, onClose }) {
    const isNew = !rider;
    const dialogRef = useRef(null);
    const [values, setValues] = useState({
        rider_id: rider?.rider_id ?? '',
        name: rider?.name ?? '',
        phone: rider?.phone ?? ''
    });
    const [errors, setErrors] = useState({});
    const [serverError, setServerError] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        dialogRef.current.showModal();
    }, []);

    function handleChange(event) {
        const { name, value } = event.target;
        setValues(current => ({ ...current, [name]: value }));
        setErrors(current => ({ ...current, [name]: undefined }));
    }

    async function handleSubmit(event) {
        event.preventDefault();

        const fieldErrors = validateRiderForm(values, { isNew });
        setErrors(fieldErrors);

        if (Object.keys(fieldErrors).length) {
            return;
        }

        setBusy(true);
        setServerError(null);

        try {
            await onSubmit({
                rider_id: values.rider_id.trim(),
                name: values.name.trim(),
                phone: values.phone.trim()
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

    return (
        <dialog ref={dialogRef} className="dialog" onCancel={handleCancel}>
            <form onSubmit={handleSubmit} noValidate>
                <h3 className="dialog__title">{isNew ? 'Add rider' : `Edit ${rider.name}`}</h3>

                {serverError && <p className="form-alert" role="alert">{serverError}</p>}

                <div className="form-fields">
                    <Field label="Rider ID" error={errors.rider_id}>
                        <input
                            name="rider_id"
                            value={values.rider_id}
                            onChange={handleChange}
                            disabled={!isNew}
                            placeholder="e.g. R1024"
                            autoFocus={isNew}
                        />
                    </Field>
                    <Field label="Full name" error={errors.name}>
                        <input
                            name="name"
                            value={values.name}
                            onChange={handleChange}
                            placeholder="e.g. Ravi Kumar"
                            autoFocus={!isNew}
                        />
                    </Field>
                    <Field label="Phone" error={errors.phone}>
                        <input
                            name="phone"
                            value={values.phone}
                            onChange={handleChange}
                            inputMode="numeric"
                            maxLength={10}
                            placeholder="10-digit mobile number"
                        />
                    </Field>
                </div>

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button" disabled={busy}>
                        {busy ? 'Saving…' : isNew ? 'Add rider' : 'Save changes'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}

function Field({ label, error, children }) {
    return (
        <label className={`field${error ? ' field--invalid' : ''}`}>
            <span className="field__label">{label}</span>
            {children}
            {error && <span className="field__error">{error}</span>}
        </label>
    );
}
