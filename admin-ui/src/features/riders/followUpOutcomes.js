// Same values as the API.
export const FOLLOW_UP_OUTCOMES = ['Promised to Pay', 'Paid', 'Unreachable', 'Refused', 'Will Improve', 'Other'];

// "Paid" is only what the rider told the caller. The due stays until an admin records the payment
// (Mark as paid) or the rider pays through the link, so it is shown as "Says paid".
export function outcomeLabel(outcome) {
    return outcome === 'Paid' ? 'Says paid' : outcome;
}
