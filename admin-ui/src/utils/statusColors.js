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
    // Follow-up outcomes ('Paid' is above).
    'Promised to Pay': 'info',
    'Will Improve': 'success',
    Unreachable: 'warning',
    Refused: 'danger',
    // Critical queue priority.
    Critical: 'danger',
    High: 'warning',
    Low: 'neutral',
    'Call due': 'warning'
};

// Unknown statuses fall back to neutral, so a new backend status still renders.
export function getStatusTone(status) {
    return STATUS_TONES[status] ?? 'neutral';
}
