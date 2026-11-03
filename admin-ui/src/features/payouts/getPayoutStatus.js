// Badge text for a week's payout: before the first run, after it, or with corrections waiting.
export function getPayoutStatus({ paid, pendingCount }) {
    if (!paid) {
        return 'Not paid';
    }

    return pendingCount > 0 ? 'Changes pending' : 'Paid';
}
