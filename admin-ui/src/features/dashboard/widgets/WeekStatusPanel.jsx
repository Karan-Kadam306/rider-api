import { useState } from 'react';

import { closeWeek } from '../../../api/billingApi';
import { useToast } from '../../../context/ToastContext';
import ConfirmDialog from '../../../components/feedback/ConfirmDialog';
import CurrencyText from '../../../components/ui/CurrencyText';
import StatusBadge from '../../../components/ui/StatusBadge';
import { toNumber } from '../../../utils/formatCurrency';
import { formatDateTime, formatWeekRange, hasWeekEnded } from '../../../utils/week';

// Mirrors billingService.closeWeek so the button explains why it is disabled.
function getCloseBlocker({ weekStart, billing, reviewCount }) {
    if (billing.closed) {
        return null;
    }

    if (!hasWeekEnded(weekStart)) {
        return 'This week can be closed from next Monday.';
    }

    if (reviewCount > 0) {
        return `${reviewCount} rider(s) need review before the week can be closed.`;
    }

    return null;
}

export default function WeekStatusPanel({ weekStart, billing, reviewCount, onClosed }) {
    const showToast = useToast();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [closing, setClosing] = useState(false);

    const blocker = getCloseBlocker({ weekStart, billing, reviewCount });
    const difference = billing.closed
        ? toNumber(billing.totalAmount) - toNumber(billing.billedTotalAmount)
        : null;

    async function handleConfirm() {
        setClosing(true);

        try {
            await closeWeek(weekStart);
            showToast({ type: 'success', message: `Week ${formatWeekRange(weekStart)} closed` });
            setConfirmOpen(false);
            onClosed();
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        } finally {
            setClosing(false);
        }
    }

    return (
        <section className="card panel">
            <div className="panel__header">
                <h3 className="panel__title">Week status</h3>
                <StatusBadge status={billing.closed ? 'Closed' : 'Open'} />
            </div>

            <dl className="detail-list">
                <div>
                    <dt>Week</dt>
                    <dd>{formatWeekRange(weekStart)}</dd>
                </div>
                <div>
                    <dt>Closed at</dt>
                    <dd>{billing.closed ? formatDateTime(billing.closedAt) : 'Not closed'}</dd>
                </div>
                <div>
                    <dt>Billed total</dt>
                    <dd><CurrencyText value={billing.billedTotalAmount} /></dd>
                </div>
                <div>
                    <dt>Live total</dt>
                    <dd><CurrencyText value={billing.totalAmount} /></dd>
                </div>
                {billing.closed && (
                    <div>
                        <dt>Difference</dt>
                        <dd><CurrencyText value={difference} showSign /></dd>
                    </div>
                )}
            </dl>

            {!billing.closed && (
                <div className="panel__footer">
                    <button
                        type="button"
                        className="button button--danger"
                        disabled={Boolean(blocker)}
                        onClick={() => setConfirmOpen(true)}
                    >
                        Close week
                    </button>
                    {blocker && <p className="panel__hint">{blocker}</p>}
                </div>
            )}

            <ConfirmDialog
                open={confirmOpen}
                title="Close this billing week?"
                message={
                    <p>
                        This saves every rider's bill for {formatWeekRange(weekStart)} as billed
                        (<CurrencyText value={billing.totalAmount} />). Closing is permanent.
                    </p>
                }
                confirmLabel="Close week"
                busy={closing}
                onConfirm={handleConfirm}
                onCancel={() => setConfirmOpen(false)}
            />
        </section>
    );
}
