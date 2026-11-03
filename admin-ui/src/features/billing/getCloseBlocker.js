import { hasWeekEnded } from '../../utils/week';

// Mirrors billingService.closeWeek so a Close week button can explain why it is disabled.
// Returns null when the week can be closed (or is already closed).
export function getCloseBlocker({ weekStart, closed, reviewCount }) {
    if (closed) {
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
