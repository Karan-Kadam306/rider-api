import { useState } from 'react';

import {
    closeEscalation,
    getEscalations,
    markEscalationPaid,
    retryEscalationLock,
    waiveEscalation
} from '../../api/escalationsApi';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import LoadingSkeleton from '../../components/feedback/LoadingSkeleton';
import CurrencyText from '../../components/ui/CurrencyText';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatDateTime, formatWeekRange } from '../../utils/week';
import { formatDate } from '../../utils/formatDate';
import EscalationActionDialog from './EscalationActionDialog';

const EVENT_LABELS = {
    Raised: 'Raised',
    LinkSent: 'Payment link sent',
    BikeLocked: 'Bike locked',
    LockFailed: 'Bike lock failed',
    Paid: 'Paid through the app',
    MarkedPaid: 'Marked as paid',
    Waived: 'Waived',
    Recovered: 'Deducted from payout',
    Closed: 'Closed',
    BikeUnlocked: 'Bike unlocked',
    UnlockFailed: 'Bike unlock failed'
};

const LOCK_LABELS = {
    Locked: 'Bike locked',
    Unlocked: 'Bike unlocked',
    NoBike: 'No bike to lock',
    Failed: 'Lock failed'
};

// The text dialog each action opens.
const ACTIONS = {
    markPaid: {
        title: 'Mark as paid',
        label: 'Payment reference',
        placeholder: 'e.g. UPI transaction ID',
        confirmLabel: 'Mark as paid',
        run: markEscalationPaid,
        done: 'Escalation marked as paid'
    },
    waive: {
        title: 'Waive escalation',
        label: 'Reason',
        placeholder: 'Why it is being waived',
        confirmLabel: 'Waive',
        run: waiveEscalation,
        done: 'Escalation waived'
    },
    close: {
        title: 'Close escalation',
        label: 'Note',
        placeholder: 'How it was resolved',
        confirmLabel: 'Close',
        run: closeEscalation,
        done: 'Escalation closed'
    }
};

// What a detail of an event adds to its timeline line, e.g. the payment reference or waive reason.
function eventNote(event) {
    const detail = event.detail ?? {};

    if (detail.promiseOverridden) {
        return `Raised despite a payment promise due ${formatDate(detail.promiseOverridden.promiseDate)}`;
    }

    return detail.paymentRef ?? detail.paymentId ?? detail.note ?? detail.reason ?? detail.error ?? null;
}

// The Escalations tab: every escalation with its timeline. Admins can act on open ones.
// onChanged reloads the page, since an action can change the balance and the open escalations.
export default function RiderEscalationsTab({ riderId, reloadKey, onChanged }) {
    const { isAdmin } = useAuth();
    const showToast = useToast();
    // { type, escalation } while an action dialog is open.
    const [action, setAction] = useState(null);
    const [retrying, setRetrying] = useState(null);

    const list = useApi(options => getEscalations(riderId, options), [riderId, reloadKey]);

    async function handleAction(text) {
        const { run, done } = ACTIONS[action.type];
        await run(action.escalation.escalationId, text);
        showToast({ message: done });
        setAction(null);
        onChanged();
    }

    async function handleRetryLock(escalation) {
        setRetrying(escalation.escalationId);

        try {
            const updated = await retryEscalationLock(escalation.escalationId);
            showToast(updated.lockStatus === 'Locked'
                ? { message: 'Bike locked' }
                : { type: 'error', message: 'The bike could not be locked. Try again later.' });
            onChanged();
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        } finally {
            setRetrying(null);
        }
    }

    if (list.loading) {
        return <LoadingSkeleton variant="table" rows={4} />;
    }

    if (list.error) {
        return <ErrorState title="Could not load escalations" error={list.error} onRetry={list.retry} />;
    }

    if (!list.data.length) {
        return (
            <section className="card">
                <EmptyState message="No escalations for this rider." />
            </section>
        );
    }

    return (
        <>
            {list.data.map(escalation => {
                const isOpen = escalation.status === 'Open';
                const isRecord = escalation.kind === 'Record';

                return (
                    <section key={escalation.escalationId} className="card panel">
                        <div className="panel__header">
                            <div>
                                <h3 className="panel__title">
                                    {escalation.amount === null ? 'Record' : <CurrencyText value={escalation.amount} />}
                                    {' · '}{escalation.reasons.join(', ')}
                                </h3>
                                <p className="panel__meta">
                                    {escalation.kind === 'Collection' ? 'Payment Due' : escalation.kind} · raised{' '}
                                    {formatDateTime(escalation.createdAt)} · week of {formatWeekRange(escalation.weekStart)}
                                </p>
                            </div>
                            <div className="row-actions">
                                {escalation.lockStatus && (
                                    <span className="cell-sub">{LOCK_LABELS[escalation.lockStatus]}</span>
                                )}
                                <StatusBadge status={escalation.status} />
                            </div>
                        </div>

                        {escalation.comment && <p>{escalation.comment}</p>}

                        {isOpen && escalation.paymentLink && (
                            <p className="cell-sub">
                                Payment link: <a href={escalation.paymentLink} target="_blank" rel="noreferrer">{escalation.paymentLink}</a>
                            </p>
                        )}

                        <ol className="timeline">
                            {escalation.events.map((event, index) => (
                                <li key={index} className="timeline__item">
                                    <div className="timeline__top">
                                        <span>{EVENT_LABELS[event.eventType] ?? event.eventType}</span>
                                        <span className="cell-sub">{formatDateTime(event.createdAt)}</span>
                                    </div>
                                    {eventNote(event) && <div className="cell-sub">{eventNote(event)}</div>}
                                </li>
                            ))}
                        </ol>

                        {isAdmin && isOpen && (
                            <div className="panel__footer">
                                {isRecord ? (
                                    <button type="button" className="pill-button" onClick={() => setAction({ type: 'close', escalation })}>
                                        Close
                                    </button>
                                ) : (
                                    <>
                                        <button type="button" className="pill-button" onClick={() => setAction({ type: 'markPaid', escalation })}>
                                            Mark as paid
                                        </button>
                                        <button type="button" className="pill-button" onClick={() => setAction({ type: 'waive', escalation })}>
                                            Waive
                                        </button>
                                    </>
                                )}
                                {escalation.lockStatus === 'Failed' && (
                                    <button
                                        type="button"
                                        className="pill-button"
                                        disabled={retrying === escalation.escalationId}
                                        onClick={() => handleRetryLock(escalation)}
                                    >
                                        {retrying === escalation.escalationId ? 'Locking…' : 'Retry lock'}
                                    </button>
                                )}
                            </div>
                        )}
                    </section>
                );
            })}

            {action && (
                <EscalationActionDialog
                    title={ACTIONS[action.type].title}
                    label={ACTIONS[action.type].label}
                    placeholder={ACTIONS[action.type].placeholder}
                    confirmLabel={ACTIONS[action.type].confirmLabel}
                    onSubmit={handleAction}
                    onClose={() => setAction(null)}
                />
            )}
        </>
    );
}
