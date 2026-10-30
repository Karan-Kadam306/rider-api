import EmptyState from '../../../components/feedback/EmptyState';

// Placeholder until the multi-week trend endpoint (closed-week snapshots) exists.
export default function WeeklyTrendChart() {
    return (
        <section className="card panel">
            <h3 className="panel__title">Weekly trend</h3>
            <EmptyState message="Coming later: total billed over the last 8 closed weeks." />
        </section>
    );
}
