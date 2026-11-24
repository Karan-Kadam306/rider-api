import { useEffect, useRef, useState } from 'react';

import Field from '../../components/ui/Field';

// Same rules as pricingService on the backend.
const WEEKLY_PACK_DAYS = 7;

function validatePackForm({ kind, name, price, kmIncluded, validityDays }) {
    const errors = {};

    if (!name.trim()) {
        errors.name = 'Name is required';
    } else if (name.trim().length > 100) {
        errors.name = 'At most 100 characters';
    }

    if (!/^\d+(\.\d{1,2})?$/.test(price.trim()) || Number(price) === 0) {
        errors.price = 'Enter a price above 0, up to 2 decimals';
    }

    if (!/^\d+$/.test(kmIncluded.trim()) || Number(kmIncluded) < 1 || Number(kmIncluded) > 10000) {
        errors.kmIncluded = 'Enter whole KM from 1 to 10,000';
    }

    if (kind === 'TopUp' && !(Number(validityDays) >= 1 && Number(validityDays) <= WEEKLY_PACK_DAYS)) {
        errors.validityDays = `Choose 1 to ${WEEKLY_PACK_DAYS} days`;
    }

    return errors;
}

// Add or edit a prepaid pack. Mounted only while open, so each opening starts fresh.
// pack: null to add, or the pack being edited (its kind cannot change).
// onSubmit(values) must return a promise; its rejection message is shown in the form.
export default function PackFormDialog({ pack, onSubmit, onClose }) {
    const isNew = !pack;
    const dialogRef = useRef(null);
    const [values, setValues] = useState({
        kind: pack?.kind ?? 'Weekly',
        name: pack?.name ?? '',
        price: pack ? String(pack.price) : '',
        kmIncluded: pack ? String(pack.kmIncluded) : '',
        validityDays: pack ? String(pack.validityDays) : '1'
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

        const fieldErrors = validatePackForm(values);
        setErrors(fieldErrors);

        if (Object.keys(fieldErrors).length) {
            return;
        }

        setBusy(true);
        setServerError(null);

        const changes = {
            name: values.name.trim(),
            price: Number(values.price),
            kmIncluded: Number(values.kmIncluded),
            // Weekly packs always last 7 days, so the backend sets it.
            validityDays: values.kind === 'TopUp' ? Number(values.validityDays) : undefined
        };

        try {
            await onSubmit(isNew ? { kind: values.kind, ...changes } : changes);
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
                <h3 className="dialog__title">{isNew ? 'Add prepaid pack' : `Edit ${pack.name}`}</h3>

                {serverError && <p className="form-alert" role="alert">{serverError}</p>}

                <div className="form-fields">
                    <Field label="Type">
                        <select name="kind" value={values.kind} onChange={handleChange} disabled={!isNew}>
                            <option value="Weekly">Weekly pack — lasts 7 days</option>
                            <option value="TopUp">KM top-up — extra KM within the weekly pack</option>
                        </select>
                    </Field>
                    <Field label="Name" error={errors.name}>
                        <input
                            name="name"
                            value={values.name}
                            onChange={handleChange}
                            maxLength={100}
                            placeholder="e.g. 400 KM Weekly"
                            autoFocus
                        />
                    </Field>
                    <Field label="Price (₹)" error={errors.price}>
                        <input name="price" inputMode="decimal" value={values.price} onChange={handleChange} />
                    </Field>
                    <Field label="KM included" error={errors.kmIncluded}>
                        <input name="kmIncluded" inputMode="numeric" value={values.kmIncluded} onChange={handleChange} />
                    </Field>
                    {values.kind === 'TopUp' && (
                        <Field label="Valid for" error={errors.validityDays}>
                            <select name="validityDays" value={values.validityDays} onChange={handleChange}>
                                {Array.from({ length: WEEKLY_PACK_DAYS }, (_, index) => index + 1).map(days => (
                                    <option key={days} value={days}>{days} day{days === 1 ? '' : 's'}</option>
                                ))}
                            </select>
                        </Field>
                    )}
                    {!isNew && (
                        <p className="muted form-note">A new price applies to packs bought from now on.</p>
                    )}
                </div>

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button" disabled={busy}>
                        {busy ? 'Saving…' : isNew ? 'Add pack' : 'Save changes'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
