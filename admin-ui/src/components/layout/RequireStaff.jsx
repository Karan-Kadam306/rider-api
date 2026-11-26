import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';

// Pages for admins and staff. A team leader is sent to their critical queue instead: the API
// refuses them everything else, so these pages would only show errors.
// Onboarding users may open Rider Management and application reviews only, and are sent there from anywhere else.
export default function RequireStaff() {
    const { isTeamLeader, isOnboarding } = useAuth();
    const { pathname } = useLocation();

    if (isTeamLeader) {
        return <Navigate to="/queue" replace />;
    }

    if (isOnboarding && pathname !== '/riders' && !pathname.startsWith('/onboarding/')) {
        return <Navigate to="/riders" replace />;
    }

    return <Outlet />;
}
