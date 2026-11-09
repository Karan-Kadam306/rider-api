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
    Failed: 'danger'
};

// Unknown statuses fall back to neutral, so a new backend status still renders.
export function getStatusTone(status) {
    return STATUS_TONES[status] ?? 'neutral';
}
