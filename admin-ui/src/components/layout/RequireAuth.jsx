import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';

// Renders the child routes only when signed in; otherwise sends the user to /login and back afterwards.
export default function RequireAuth() {
    const { user } = useAuth();
    const location = useLocation();

    // Session check still running: wait, so a signed-in user never sees the login page flash.
    if (user === undefined) {
        return <div className="auth-loading" aria-busy="true" aria-label="Loading" />;
    }

    // state.from lets LoginPage bring the user back here after sign-in.
    if (!user) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }

    return <Outlet />;
}
