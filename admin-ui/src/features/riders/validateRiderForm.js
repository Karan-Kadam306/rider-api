// Same rules as the backend's validateCreateRider / validateUpdateRider middleware,
// so most mistakes are caught before a request is sent.
// Returns { field: message } for each invalid field; empty when the form is valid.
export function validateRiderForm({ rider_id, name, phone }, { isNew }) {
    const errors = {};
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    if (isNew) {
        if (!rider_id.trim()) {
            errors.rider_id = 'Rider ID is required';
        } else if (rider_id.trim().length > 100) {
            errors.rider_id = 'Rider ID must be 100 characters or fewer';
        }
    }

    if (!trimmedName) {
        errors.name = 'Name is required';
    } else if (/\p{N}/u.test(trimmedName)) {
        errors.name = 'Name must not contain numbers';
    } else if (!/\p{L}/u.test(trimmedName)) {
        errors.name = 'Name must contain at least one letter';
    } else if (trimmedName.length > 150) {
        errors.name = 'Name must be 150 characters or fewer';
    }

    if (!trimmedPhone) {
        errors.phone = 'Phone is required';
    } else if (!/^[6-9]\d{9}$/.test(trimmedPhone)) {
        errors.phone = 'Enter a valid 10-digit Indian mobile number';
    }

    return errors;
}
