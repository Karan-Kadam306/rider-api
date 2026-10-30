import { useSearchParams } from 'react-router-dom';

import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/feedback/EmptyState';

export default function DailyKmPage() {
    const [searchParams] = useSearchParams();
    const status = searchParams.get('status');

    return (
        <>
            <PageHeader
                title="Daily KM"
                subtitle={status ? `Showing ${status} records` : 'Upload, validate and review daily KM records.'}
            />
            <EmptyState message="The Daily KM review queue is coming next." />
        </>
    );
}
