import { useEffect, useRef, useState } from 'react';

import Field from '../../components/ui/Field';
import { validateUserForm } from './validateUserForm';

// Add or edit a user. Mounted only while open, so each opening starts fresh.
// user: null to add a new user, or the user being edited (email cannot change).
// isSelf: editing your own account, so the role is locked.
// onSubmit(values) must return a promise; its rejection message is shown in the form.
export default function UserFormDialog({ user, isSelf = false, onSubmit, onClose }) {
    const isNew = !user;
    const dialogRef = useRef(null);
    const [values, setValues] = useState({
        name: user?.name ?? '',
        email: user?.email ?? '',
        role: user?.role ?? 'staff',
        password: '',
        repeat: ''
    });
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

        const fieldErrors = validateUserForm(values, { isNew });
        setErrors(fieldErrors);

        if (Object.keys(fieldErrors).length) {
            return;
        }

        setBusy(true);
        setServerError(null);

        try {
            await onSubmit(isNew
                ? { name: values.name.trim(), email: values.email.trim(), role: values.role, password: values.password }
                : { name: values.name.trim(), role: values.role });
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
                <h3 className="dialog__title">{isNew ? 'Add user' : `Edit ${user.name}`}</h3>

                {serverError && <p className="form-alert" role="alert">{serverError}</p>}

                <div className="form-fields">
                    <Field label="Full name" error={errors.name}>
                        <input
                            name="name"
                            value={values.name}
                            onChange={handleChange}
                            maxLength={100}
                            placeholder="e.g. Priya Sharma"
                            autoFocus
                        />
                    </Field>
                    <Field label="Email" error={errors.email}>
                        <input
                            name="email"
                            type="email"
                            value={values.email}
                            onChange={handleChange}
                            disabled={!isNew}
                            autoComplete="off"
                            placeholder="name@company.com"
                        />
                    </Field>
                    <Field label="Role">
                        <select name="role" value={values.role} onChange={handleChange} disabled={isSelf}>
                            <option value="staff">Staff — day-to-day work</option>
                            <option value="admin">Admin — also closes weeks, runs payouts, manages users</option>
                        </select>
                    </Field>
                    {isSelf && <p className="muted form-note">You cannot change your own role.</p>}

                    {isNew && (
                        <>
                            <Field label="Starting password" error={errors.password}>
                                <input
                                    name="password"
                                    type={passwordType}
                                    value={values.password}
                                    onChange={handleChange}
                                    autoComplete="new-password"
                                    placeholder="At least 8 characters"
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
                            <p className="muted form-note">
                                Share it with the user privately; they can change it after signing in.
                            </p>
                        </>
                    )}
                </div>

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button" disabled={busy}>
                        {busy ? 'Saving…' : isNew ? 'Add user' : 'Save changes'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
