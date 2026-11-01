import { useEffect, useRef, useState } from 'react';

import Field from '../../components/ui/Field';

// Same limits as bikeService.createBike on the backend.
function validateBikeForm({ registrationNumber, chassisNumber }) {
    const errors = {};

    if (!chassisNumber.trim()) {
        errors.chassisNumber = 'Chassis number is required';
    } else if (chassisNumber.trim().length > 50) {
        errors.chassisNumber = 'Chassis number must be 50 characters or fewer';
    }

    if (registrationNumber.trim().length > 20) {
        errors.registrationNumber = 'Registration number must be 20 characters or fewer';
    }

    return errors;
}

// Add a new bike. Mounted only while open, so each opening starts fresh.
// onSubmit(values) must return a promise; its rejection message is shown in the form.
export default function BikeFormDialog({ onSubmit, onClose }) {
    const dialogRef = useRef(null);
    const [values, setValues] = useState({ registrationNumber: '', chassisNumber: '' });
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

        const fieldErrors = validateBikeForm(values);
        setErrors(fieldErrors);

        if (Object.keys(fieldErrors).length) {
            return;
        }

        setBusy(true);
        setServerError(null);

        try {
            await onSubmit({
                registrationNumber: values.registrationNumber.trim(),
                chassisNumber: values.chassisNumber.trim()
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
                <h3 className="dialog__title">Add bike</h3>

                {serverError && <p className="form-alert" role="alert">{serverError}</p>}

                <div className="form-fields">
                    <Field label="Chassis number (VIN)" error={errors.chassisNumber}>
                        <input
                            name="chassisNumber"
                            value={values.chassisNumber}
                            onChange={handleChange}
                            placeholder="Used to match Daily KM uploads"
                            autoFocus
                        />
                    </Field>
                    <Field label="Registration number (optional)" error={errors.registrationNumber}>
                        <input
                            name="registrationNumber"
                            value={values.registrationNumber}
                            onChange={handleChange}
                            placeholder="e.g. MH12AB1234"
                        />
                    </Field>
                </div>

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button" disabled={busy}>
                        {busy ? 'Saving…' : 'Add bike'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
