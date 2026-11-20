import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';

// Pages for team leaders only; anyone else goes back to the dashboard.
export default function RequireTeamLeader() {
    const { isTeamLeader } = useAuth();

    if (!isTeamLeader) {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
}
