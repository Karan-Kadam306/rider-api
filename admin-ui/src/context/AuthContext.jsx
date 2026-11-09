import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import * as authApi from '../api/authApi';
import { setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

// The signed-in user. user is undefined while the session is being checked, null when signed out.
export function AuthProvider({ children }) {
    const [user, setUser] = useState(undefined);

    // On page load, ask the API who is signed in: the session cookie is httpOnly, so scripts cannot read it.
    useEffect(() => {
        const controller = new AbortController();

        authApi
            .getCurrentUser({ signal: controller.signal })
            .then(data => setUser(data.user))
            .catch(error => {
                if (error.name !== 'AbortError') {
                    setUser(null);
                }
            });

        // A 401 from any later request means the session ended.
        setUnauthorizedHandler(() => setUser(null));

        return () => {
            controller.abort();
            setUnauthorizedHandler(() => {});
        };
    }, []);

    // A failed sign-in rejects to the caller, so the login form can show the message.
    const signIn = useCallback(async credentials => {
        const data = await authApi.login(credentials);
        setUser(data.user);
    }, []);

    // Re-read the signed-in user, e.g. after they renamed themselves on the Users page.
    const reloadUser = useCallback(async () => {
        try {
            const data = await authApi.getCurrentUser();
            setUser(data.user);
        } catch {
            // A 401 already signs the user out through the unauthorized handler.
        }
    }, []);

    // Signed out locally even if the request fails, so the user is never stuck.
    const signOut = useCallback(async () => {
        try {
            await authApi.logout();
        } finally {
            setUser(null);
        }
    }, []);

    // Memoised so consumers re-render only when the user changes.
    const value = useMemo(
        () => ({ user, isAdmin: user?.role === 'admin', signIn, signOut, reloadUser }),
        [user, signIn, signOut, reloadUser]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Returns { user, isAdmin, signIn, signOut, reloadUser }.
export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error('useAuth must be used inside AuthProvider');
    }

    return context;
}
