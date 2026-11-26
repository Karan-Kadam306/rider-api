import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';

// Keeps onboarding users off pages the API refuses them (the rider page shows bills and balances);
// they go back to Rider Management.
export default function RequireNotOnboarding() {
    const { isOnboarding } = useAuth();

    if (isOnboarding) {
        return <Navigate to="/riders" replace />;
    }

    return <Outlet />;
}
