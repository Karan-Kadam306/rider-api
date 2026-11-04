import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import * as authApi from '../api/authApi';
import { setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

// The signed-in user. user is undefined while the session is being checked, null when signed out.
export function AuthProvider({ children }) {
    const [user, setUser] = useState(undefined);

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

    const value = useMemo(
        () => ({ user, isAdmin: user?.role === 'admin', signIn, signOut, reloadUser }),
        [user, signIn, signOut, reloadUser]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error('useAuth must be used inside AuthProvider');
    }

    return context;
}
