import { useEffect, useRef, useState } from 'react';

import Field from '../../components/ui/Field';
import { formatINR } from '../../utils/formatCurrency';
import { addDays, todayInIst } from '../../utils/week';

// Same lists and limits as the API.
const REASONS = ['Payment Due', 'Performance', 'Attendance', 'Other'];
const OUTCOMES = ['Promised to Pay', 'Paid', 'Unreachable', 'Refused', 'Will Improve', 'Other'];
const MAX_PROMISE_DAYS = 30;
const MAX_NOTE_LENGTH = 1000;

// Log what the rider said on a call. Mounted only while open, so each opening starts fresh.
// A follow-up cannot be edited once saved, so the dialog says so.
// onSubmit(values) must return a promise; its rejection message is shown in the form.
export default function FollowUpDialog({ rider, outstandingBalance, openEscalations, onSubmit, onClose }) {
    const dialogRef = useRef(null);
    const today = todayInIst();
    const [values, setValues] = useState({
        // Most calls are about money, so start there when the rider owes something.
        reason: outstandingBalance > 0 ? 'Payment Due' : 'Performance',
        outcome: '',
        note: '',
        promiseDate: '',
        promiseAmount: '',
        escalationId: ''
    });
    const [errors, setErrors] = useState({});
    const [serverError, setServerError] = useState(null);
    const [busy, setBusy] = useState(false);

    const promised = values.outcome === 'Promised to Pay';

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

        if (!values.outcome) {
            fieldErrors.outcome = 'Choose what the rider said';
        }

        if (!values.note.trim()) {
            fieldErrors.note = 'Write down what the rider said';
        }

        if (promised) {
            if (!values.promiseDate) {
                fieldErrors.promiseDate = 'Enter the date the rider promised to pay';
            } else if (values.promiseDate < today || values.promiseDate > addDays(today, MAX_PROMISE_DAYS)) {
                fieldErrors.promiseDate = `Choose a date from today up to ${MAX_PROMISE_DAYS} days ahead`;
            }

            const amount = values.promiseAmount.trim();

            if (amount && (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0)) {
                fieldErrors.promiseAmount = 'Enter an amount in rupees, e.g. 500 or 499.50';
            }
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
                reason: values.reason,
                outcome: values.outcome,
                note: values.note.trim(),
                promiseDate: promised ? values.promiseDate : null,
                promiseAmount: promised && values.promiseAmount.trim() ? Number(values.promiseAmount) : null,
                escalationId: values.escalationId ? Number(values.escalationId) : null
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
                <h3 className="dialog__title">Log follow-up</h3>
                <p className="cell-sub">
                    {rider.name} · <span className="mono">{rider.riderId}</span>
                    {outstandingBalance > 0 && <> · owes {formatINR(outstandingBalance)}</>}
                </p>

                {serverError && <p className="form-alert" role="alert">{serverError}</p>}

                <div className="form-fields">
                    <div className="form-row">
                        <Field label="About">
                            <select name="reason" value={values.reason} onChange={handleChange}>
                                {REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}
                            </select>
                        </Field>
                        <Field label="Outcome" error={errors.outcome}>
                            <select name="outcome" value={values.outcome} onChange={handleChange}>
                                <option value="">Choose…</option>
                                {OUTCOMES.map(outcome => <option key={outcome} value={outcome}>{outcome}</option>)}
                            </select>
                        </Field>
                    </div>

                    {promised && (
                        <div className="form-row">
                            <Field label="Promised date" error={errors.promiseDate}>
                                <input
                                    type="date"
                                    name="promiseDate"
                                    value={values.promiseDate}
                                    min={today}
                                    max={addDays(today, MAX_PROMISE_DAYS)}
                                    onChange={handleChange}
                                />
                            </Field>
                            <Field label="Promised amount (₹)" error={errors.promiseAmount}>
                                <input
                                    name="promiseAmount"
                                    value={values.promiseAmount}
                                    onChange={handleChange}
                                    inputMode="decimal"
                                    placeholder="Optional"
                                />
                            </Field>
                        </div>
                    )}

                    <Field label="What did the rider say?" error={errors.note}>
                        <textarea
                            name="note"
                            value={values.note}
                            onChange={handleChange}
                            rows={4}
                            maxLength={MAX_NOTE_LENGTH}
                            placeholder="e.g. Will pay ₹500 on Friday after partner payout"
                        />
                    </Field>

                    {openEscalations.length > 0 && (
                        <Field label="About an escalation">
                            <select name="escalationId" value={values.escalationId} onChange={handleChange}>
                                <option value="">None</option>
                                {openEscalations.map(escalation => (
                                    <option key={escalation.escalationId} value={escalation.escalationId}>
                                        {escalation.reasons.join(', ')}
                                        {escalation.amount !== null ? ` · ${formatINR(escalation.amount)}` : ' · Record'}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    )}

                    <p className="form-note muted">A follow-up cannot be edited or deleted once saved.</p>
                </div>

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button" disabled={busy}>
                        {busy ? 'Saving…' : 'Save follow-up'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
