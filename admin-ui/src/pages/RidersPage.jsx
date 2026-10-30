import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/feedback/EmptyState';

export default function RidersPage() {
    return (
        <>
            <PageHeader title="Riders" subtitle="Search, create and manage riders." />
            <EmptyState message="The riders list is coming next." />
        </>
    );
}
