import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/feedback/EmptyState';

export default function BikesPage() {
    return (
        <>
            <PageHeader title="Bikes" subtitle="Fleet status, assignments and returns." />
            <EmptyState message="The bikes list is coming next." />
        </>
    );
}
