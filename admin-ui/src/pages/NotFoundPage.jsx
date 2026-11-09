import { Link } from 'react-router-dom';

import PageHeader from '../components/layout/PageHeader';

// Shown inside the app layout for any address that matches no route.
export default function NotFoundPage() {
    return (
        <>
            <PageHeader title="Page not found" subtitle="That address doesn't match any page." />
            <Link className="button button--secondary" to="/">Back to dashboard</Link>
        </>
    );
}
