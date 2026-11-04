import { useEffect, useRef, useState } from 'react';

import Field from '../../components/ui/Field';
import { validateNewPassword } from '../users/validateUserForm';

// Any signed-in user changes their own password. Mounted only while open.
// onSubmit({ currentPassword, newPassword }) must return a promise; its rejection message is shown.
export default function ChangePasswordDialog({ onSubmit, onClose }) {
    const dialogRef = useRef(null);
    const [values, setValues] = useState({ currentPassword: '', newPassword: '', repeat: '' });
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

        const fieldErrors = validateNewPassword(values.newPassword, values.repeat, { field: 'newPassword' });

        if (!values.currentPassword) {
            fieldErrors.currentPassword = 'Enter your current password';
        } else if (values.newPassword && values.newPassword === values.currentPassword) {
            fieldErrors.newPassword = 'Choose a password different from the current one';
        }

        setErrors(fieldErrors);

        if (Object.keys(fieldErrors).length) {
            return;
        }

        setBusy(true);
        setServerError(null);

        try {
            await onSubmit({ currentPassword: values.currentPassword, newPassword: values.newPassword });
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
                <h3 className="dialog__title">Change password</h3>
                <p className="dialog__message">Other browsers signed in to your account will be signed out.</p>

                {serverError && <p className="form-alert" role="alert">{serverError}</p>}

                <div className="form-fields">
                    <Field label="Current password" error={errors.currentPassword}>
                        <input
                            name="currentPassword"
                            type="password"
                            value={values.currentPassword}
                            onChange={handleChange}
                            autoComplete="current-password"
                            autoFocus
                        />
                    </Field>
                    <Field label="New password" error={errors.newPassword}>
                        <input
                            name="newPassword"
                            type="password"
                            value={values.newPassword}
                            onChange={handleChange}
                            autoComplete="new-password"
                            placeholder="At least 8 characters"
                        />
                    </Field>
                    <Field label="Repeat new password" error={errors.repeat}>
                        <input
                            name="repeat"
                            type="password"
                            value={values.repeat}
                            onChange={handleChange}
                            autoComplete="new-password"
                        />
                    </Field>
                </div>

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button" disabled={busy}>
                        {busy ? 'Saving…' : 'Change password'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
