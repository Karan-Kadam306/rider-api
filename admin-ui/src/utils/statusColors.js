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
    'Not paid': 'neutral',
    'Changes pending': 'warning',
    Completed: 'success',
    Partial: 'warning',
    Failed: 'danger'
};

export function getStatusTone(status) {
    return STATUS_TONES[status] ?? 'neutral';
}
