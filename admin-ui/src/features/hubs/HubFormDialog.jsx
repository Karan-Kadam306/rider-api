import { useEffect, useRef, useState } from 'react';

import Field from '../../components/ui/Field';

// Same limits as hubService on the backend.
function validateHubForm({ code, name, city, address, contactPhone, managerName }) {
    const errors = {};

    if (!/^[A-Za-z0-9-]{2,10}$/.test(code.trim())) {
        errors.code = '2 to 10 letters, digits or dashes';
    }

    if (!name.trim()) {
        errors.name = 'Name is required';
    } else if (name.trim().length > 100) {
        errors.name = 'At most 100 characters';
    }

    if (!city.trim()) {
        errors.city = 'City is required';
    } else if (city.trim().length > 60) {
        errors.city = 'At most 60 characters';
    }

    if (!address.trim()) {
        errors.address = 'Address is required';
    } else if (address.trim().length > 300) {
        errors.address = 'At most 300 characters';
    }

    if (contactPhone.trim() && !/^[6-9]\d{9}$/.test(contactPhone.trim())) {
        errors.contactPhone = 'Enter a valid 10-digit mobile number';
    }

    if (managerName.trim().length > 100) {
        errors.managerName = 'At most 100 characters';
    }

    return errors;
}

// Add or edit a hub. Mounted only while open, so each opening starts fresh.
// hub: null to add a new hub, or the hub being edited.
// onSubmit(values) must return a promise; its rejection message is shown in the form.
export default function HubFormDialog({ hub, onSubmit, onClose }) {
    const isNew = !hub;
    const dialogRef = useRef(null);
    const [values, setValues] = useState({
        code: hub?.code ?? '',
        name: hub?.name ?? '',
        city: hub?.city ?? '',
        address: hub?.address ?? '',
        contactPhone: hub?.contactPhone ?? '',
        managerName: hub?.managerName ?? ''
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

        const fieldErrors = validateHubForm(values);
        setErrors(fieldErrors);

        if (Object.keys(fieldErrors).length) {
            return;
        }

        setBusy(true);
        setServerError(null);

        try {
            // An empty phone or manager clears it on an edit. The API saves the code in capitals.
            await onSubmit({
                code: values.code.trim(),
                name: values.name.trim(),
                city: values.city.trim(),
                address: values.address.trim(),
                contactPhone: values.contactPhone.trim(),
                managerName: values.managerName.trim()
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
                <h3 className="dialog__title">{isNew ? 'Add hub' : `Edit ${hub.name}`}</h3>

                {serverError && <p className="form-alert" role="alert">{serverError}</p>}

                <div className="form-fields">
                    <Field label="Hub name" error={errors.name}>
                        <input
                            name="name"
                            value={values.name}
                            onChange={handleChange}
                            maxLength={100}
                            placeholder="e.g. Wakad Hub"
                            autoFocus
                        />
                    </Field>
                    <Field label="Hub code" error={errors.code}>
                        <input
                            name="code"
                            className="mono"
                            value={values.code}
                            onChange={handleChange}
                            maxLength={10}
                            placeholder="e.g. PUN-WKD"
                        />
                    </Field>
                    <Field label="City" error={errors.city}>
                        <input name="city" value={values.city} onChange={handleChange} maxLength={60} placeholder="e.g. Pune" />
                    </Field>
                    <Field label="Address" error={errors.address}>
                        <input
                            name="address"
                            value={values.address}
                            onChange={handleChange}
                            maxLength={300}
                            placeholder="Shown to riders when they come to collect their bike"
                        />
                    </Field>
                    <Field label="Contact phone (optional)" error={errors.contactPhone}>
                        <input
                            name="contactPhone"
                            type="tel"
                            inputMode="numeric"
                            value={values.contactPhone}
                            onChange={handleChange}
                            maxLength={10}
                            placeholder="10-digit mobile number"
                        />
                    </Field>
                    <Field label="Hub manager (optional)" error={errors.managerName}>
                        <input
                            name="managerName"
                            value={values.managerName}
                            onChange={handleChange}
                            maxLength={100}
                            placeholder="e.g. Suresh Pawar"
                        />
                    </Field>
                </div>

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button" disabled={busy}>
                        {busy ? 'Saving…' : isNew ? 'Add hub' : 'Save changes'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
