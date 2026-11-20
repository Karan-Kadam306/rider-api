import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';

// Pages for admins and staff. A team leader is sent to their own riders instead: the API
// refuses them everything else, so these pages would only show errors.
export default function RequireStaff() {
    const { isTeamLeader } = useAuth();

    if (isTeamLeader) {
        return <Navigate to="/my-riders" replace />;
    }

    return <Outlet />;
}
