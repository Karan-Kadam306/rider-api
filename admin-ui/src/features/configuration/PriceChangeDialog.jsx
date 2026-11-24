import { useEffect, useRef, useState } from 'react';

import Field from '../../components/ui/Field';

// A rupee amount with up to 2 decimals, as the backend accepts.
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

// Schedule a new postpaid rate or deposit amount from a date. Mounted only while open.
// fields: [{ name, label, allowZero }] for the amounts; effectiveFrom is always asked.
// onSubmit(values) gets numbers and must return a promise; its rejection message is shown.
export default function PriceChangeDialog({ title, note, fields, onSubmit, onClose }) {
    const dialogRef = useRef(null);
    const [values, setValues] = useState(() => ({
        ...Object.fromEntries(fields.map(field => [field.name, ''])),
        effectiveFrom: ''
    }));
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

    function validate() {
        const fieldErrors = {};

        for (const field of fields) {
            const value = values[field.name].trim();

            if (!AMOUNT_PATTERN.test(value) || (!field.allowZero && Number(value) === 0)) {
                fieldErrors[field.name] = `Enter an amount${field.allowZero ? '' : ' above 0'}, up to 2 decimals`;
            }
        }

        if (!values.effectiveFrom) {
            fieldErrors.effectiveFrom = 'Choose the date it starts';
        }

        return fieldErrors;
    }

    async function handleSubmit(event) {
        event.preventDefault();

        const fieldErrors = validate();
        setErrors(fieldErrors);

        if (Object.keys(fieldErrors).length) {
            return;
        }

        setBusy(true);
        setServerError(null);

        try {
            await onSubmit({
                ...Object.fromEntries(fields.map(field => [field.name, Number(values[field.name])])),
                effectiveFrom: values.effectiveFrom
            });
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

                {serverError && <p className="form-alert" role="alert">{serverError}</p>}

                <div className="form-fields">
                    {fields.map((field, index) => (
                        <Field key={field.name} label={field.label} error={errors[field.name]}>
                            <input
                                name={field.name}
                                inputMode="decimal"
                                value={values[field.name]}
                                onChange={handleChange}
                                autoFocus={index === 0}
                            />
                        </Field>
                    ))}
                    <Field label="Starts on" error={errors.effectiveFrom}>
                        <input name="effectiveFrom" type="date" value={values.effectiveFrom} onChange={handleChange} />
                    </Field>
                    {note && <p className="muted form-note">{note}</p>}
                </div>

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button" disabled={busy}>
                        {busy ? 'Saving…' : 'Schedule'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
