import { useEffect, useRef, useState } from 'react';

import Field from '../../components/ui/Field';
import { formatINR } from '../../utils/formatCurrency';

// Same list and order as the API.
const REASONS = [
    'Payment Due',
    'SOP Violation',
    'Attendance Issues',
    'Safety Concern',
    'Customer Complaint',
    'Document Non-Compliance',
    'Bike Misuse',
    'Partner Deactivation',
    'Policy Violation',
    'Other'
];

// Raise an escalation for a rider. Mounted only while open, so each opening starts fresh.
// Payment Due collects the outstanding balance, so its amount is fixed. Leaving the amount
// empty makes a Record: kept for history, with no bike lock or payment link.
// onSubmit(values) must return a promise; its rejection message is shown in the form.
export default function EscalateDialog({ rider, outstandingBalance, onSubmit, onClose }) {
    const dialogRef = useRef(null);
    const [reasons, setReasons] = useState([]);
    const [amount, setAmount] = useState('');
    const [comment, setComment] = useState('');
    const [errors, setErrors] = useState({});
    const [serverError, setServerError] = useState(null);
    const [busy, setBusy] = useState(false);

    const paymentDue = reasons.includes('Payment Due');

    useEffect(() => {
        dialogRef.current.showModal();
    }, []);

    function toggleReason(reason) {
        setReasons(current => current.includes(reason)
            ? current.filter(item => item !== reason)
            : [...current, reason]);
        setErrors({});
    }

    function validate() {
        const fieldErrors = {};

        if (!reasons.length) {
            fieldErrors.reasons = 'Select at least one reason';
        }

        if (reasons.includes('Other') && !comment.trim()) {
            fieldErrors.comment = 'Describe the reason when you select Other';
        }

        if (!paymentDue && amount.trim() && !/^\d+(\.\d{1,2})?$/.test(amount.trim())) {
            fieldErrors.amount = 'Enter an amount in rupees, e.g. 500 or 499.50';
        } else if (!paymentDue && amount.trim() && Number(amount) <= 0) {
            fieldErrors.amount = 'Amount must be more than zero';
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
                // Keep the API's order, whatever order they were ticked in.
                reasons: REASONS.filter(reason => reasons.includes(reason)),
                amount: paymentDue || !amount.trim() ? null : Number(amount),
                comment: comment.trim() || null
            });
        } catch (error) {
            setServerError(error.message);
            setBusy(false);
        }
    }

    function handleCancel(event) {
        event.preventDefault();

        if (!busy) {
            onClose();
        }
    }

    return (
        <dialog ref={dialogRef} className="dialog dialog--wide" onCancel={handleCancel}>
            <form onSubmit={handleSubmit} noValidate>
                <h3 className="dialog__title">Create escalation</h3>
                <p className="cell-sub">{rider.name} · <span className="mono">{rider.riderId}</span></p>

                {serverError && <p className="form-alert" role="alert">{serverError}</p>}

                <div className="form-fields">
                    <fieldset className={`reason-grid${errors.reasons ? ' field--invalid' : ''}`}>
                        <legend className="field__label">Reasons</legend>
                        {REASONS.map(reason => (
                            <label key={reason} className="checkbox reason-option">
                                <input
                                    type="checkbox"
                                    checked={reasons.includes(reason)}
                                    disabled={reason === 'Payment Due' && !(outstandingBalance > 0)}
                                    onChange={() => toggleReason(reason)}
                                />
                                {reason}
                            </label>
                        ))}
                        {errors.reasons && <span className="field__error">{errors.reasons}</span>}
                    </fieldset>
                    {!(outstandingBalance > 0) && (
                        <p className="form-note muted">Payment Due needs an outstanding balance; this rider owes nothing.</p>
                    )}

                    <Field label="Amount (₹)" error={errors.amount}>
                        <input
                            value={paymentDue ? String(outstandingBalance) : amount}
                            onChange={event => setAmount(event.target.value)}
                            readOnly={paymentDue}
                            inputMode="decimal"
                            placeholder="Leave empty to only record it"
                        />
                    </Field>
                    <p className="form-note muted">
                        {paymentDue
                            ? `Collects the outstanding balance of ${formatINR(outstandingBalance)}.`
                            : amount.trim()
                                ? 'Locks the bike and sends a payment link. Deducted from this week\'s payout if not paid.'
                                : 'No amount: recorded only, with no bike lock or payment link.'}
                    </p>

                    <Field label="Comment" error={errors.comment}>
                        <textarea
                            value={comment}
                            onChange={event => {
                                setComment(event.target.value);
                                setErrors(current => ({ ...current, comment: undefined }));
                            }}
                            rows={3}
                            maxLength={1000}
                            placeholder={reasons.includes('Other') ? 'Required for Other' : 'Optional'}
                        />
                    </Field>
                </div>

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button button--danger" disabled={busy}>
                        {busy ? 'Creating…' : 'Create escalation'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
