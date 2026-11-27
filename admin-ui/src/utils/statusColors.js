// One colour tone per status, shared by StatusBadge and StatusBreakdown.
const STATUS_TONES = {
    Active: 'success',
    Available: 'success',
    Validated: 'success',
    Assigned: 'info',
    Open: 'info',
    Inactive: 'warning',
    Maintenance: 'warning',
    Pending: 'warning',
    'Needs Review': 'danger',
    Terminated: 'danger',
    Closed: 'neutral',
    Paid: 'success',
    Approved: 'success',
    'Not paid': 'neutral',
    'Changes pending': 'warning',
    Completed: 'success',
    Partial: 'warning',
    Failed: 'danger',
    Waived: 'neutral',
    Recovered: 'info',
    // Follow-up outcomes ('Paid' is shown as 'Says paid').
    'Says paid': 'info',
    'Promised to Pay': 'info',
    'Will Improve': 'success',
    Unreachable: 'warning',
    Refused: 'danger',
    // Configuration: a price in effect now or starting later.
    'In effect': 'success',
    Scheduled: 'info',
    // Critical queue priority.
    Critical: 'danger',
    High: 'warning',
    Low: 'neutral',
    'Call due': 'warning',
    // Rider applications and the items reviewed on them.
    Draft: 'neutral',
    'Pending Review': 'warning',
    'Changes Requested': 'warning',
    Resubmitted: 'info',
    'On Hold': 'warning',
    Rejected: 'danger',
    'Payment Pending': 'info',
    'Bike Pending': 'info',
    Verified: 'success',
    // Onboarding payments: an order, a payment still due, and the deposit we hold.
    Created: 'info',
    Due: 'warning',
    Expired: 'neutral',
    Held: 'success',
    // Duplicate and KYC checks.
    Clear: 'success',
    Flagged: 'danger',
    Mismatch: 'danger'
};

// Unknown statuses fall back to neutral, so a new backend status still renders.
export function getStatusTone(status) {
    return STATUS_TONES[status] ?? 'neutral';
}
