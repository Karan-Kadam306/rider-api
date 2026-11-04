import { useEffect, useRef, useState } from 'react';

import Field from '../../components/ui/Field';
import { validateNewPassword } from './validateUserForm';

// An admin sets a new password for another user. Mounted only while open.
// onSubmit(password) must return a promise; its rejection message is shown in the form.
export default function ResetPasswordDialog({ user, onSubmit, onClose }) {
    const dialogRef = useRef(null);
    const [values, setValues] = useState({ password: '', repeat: '' });
    const [showPassword, setShowPassword] = useState(false);
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

        const fieldErrors = validateNewPassword(values.password, values.repeat);
        setErrors(fieldErrors);

        if (Object.keys(fieldErrors).length) {
            return;
        }

        setBusy(true);
        setServerError(null);

        try {
            await onSubmit(values.password);
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

    const passwordType = showPassword ? 'text' : 'password';

    return (
        <dialog ref={dialogRef} className="dialog" onCancel={handleCancel}>
            <form onSubmit={handleSubmit} noValidate>
                <h3 className="dialog__title">Reset password for {user.name}</h3>
                <p className="dialog__message">
                    {user.email} will be signed out everywhere and must sign in with the new password.
                </p>

                {serverError && <p className="form-alert" role="alert">{serverError}</p>}

                <div className="form-fields">
                    <Field label="New password" error={errors.password}>
                        <input
                            name="password"
                            type={passwordType}
                            value={values.password}
                            onChange={handleChange}
                            autoComplete="new-password"
                            placeholder="At least 8 characters"
                            autoFocus
                        />
                    </Field>
                    <Field label="Repeat password" error={errors.repeat}>
                        <input
                            name="repeat"
                            type={passwordType}
                            value={values.repeat}
                            onChange={handleChange}
                            autoComplete="new-password"
                        />
                    </Field>
                    <label className="checkbox">
                        <input
                            type="checkbox"
                            checked={showPassword}
                            onChange={event => setShowPassword(event.target.checked)}
                        />
                        Show password
                    </label>
                </div>

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button" disabled={busy}>
                        {busy ? 'Saving…' : 'Reset password'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
