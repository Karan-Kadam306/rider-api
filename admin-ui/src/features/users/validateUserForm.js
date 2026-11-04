// Mirrors the backend rules in services/userService.js.
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Errors for a new password and its repeat, keyed by field name.
export function validateNewPassword(password, repeat, { field = 'password', repeatField = 'repeat' } = {}) {
    const errors = {};

    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
        errors[field] = `Use ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters`;
    } else if (repeat !== password) {
        errors[repeatField] = 'Passwords do not match';
    }

    return errors;
}

export function validateUserForm(values, { isNew }) {
    const errors = {};

    if (!values.name.trim()) {
        errors.name = 'Name is required';
    } else if (values.name.trim().length > 100) {
        errors.name = 'At most 100 characters';
    }

    if (isNew) {
        const email = values.email.trim();

        if (!EMAIL_PATTERN.test(email) || email.length > 254) {
            errors.email = 'Enter a valid email address';
        }

        Object.assign(errors, validateNewPassword(values.password, values.repeat));
    }

    return errors;
}
