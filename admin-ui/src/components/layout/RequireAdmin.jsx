import { Link, Outlet } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import PageHeader from './PageHeader';

// Renders the child routes for admins only. The API enforces the same rule; this just avoids
// showing staff a page whose every request would be refused.
export default function RequireAdmin() {
    const { isAdmin } = useAuth();

    if (!isAdmin) {
        return (
            <>
                <PageHeader title="Admins only" subtitle="Ask an admin if you need access to this page." />
                <Link className="button button--secondary" to="/">Back to dashboard</Link>
            </>
        );
    }

    return <Outlet />;
}
