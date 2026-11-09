import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import Field from '../components/ui/Field';

// Public sign-in page. Once signIn sets the user, the redirect below takes over.
export default function LoginPage() {
    const { user, signIn } = useAuth();
    const location = useLocation();
    const [values, setValues] = useState({ email: '', password: '' });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    // Back to the page that asked for sign-in, or the dashboard.
    if (user) {
        const from = location.state?.from;
        return <Navigate to={from ? `${from.pathname}${from.search}` : '/'} replace />;
    }

    function handleChange(event) {
        const { name, value } = event.target;
        setValues(current => ({ ...current, [name]: value }));
    }

    async function handleSubmit(event) {
        event.preventDefault();

        if (!values.email.trim() || !values.password) {
            setError('Enter your email and password');
            return;
        }

        setBusy(true);
        setError(null);

        try {
            await signIn({ email: values.email.trim(), password: values.password });
        } catch (signInError) {
            // busy is only reset on failure; on success the redirect unmounts this page.
            setError(signInError.message);
            setBusy(false);
        }
    }

    return (
        <main className="login-page">
            <form className="card login-card" onSubmit={handleSubmit} noValidate>
                <div className="login-card__brand">
                    <span className="sidebar__logo">R</span>
                    Rider Admin
                </div>
                <h1 className="login-card__title">Sign in</h1>

                {error && <p className="form-alert" role="alert">{error}</p>}

                <div className="form-fields">
                    <Field label="Email">
                        <input
                            name="email"
                            type="email"
                            autoComplete="username"
                            value={values.email}
                            onChange={handleChange}
                            autoFocus
                        />
                    </Field>
                    <Field label="Password">
                        <input
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            value={values.password}
                            onChange={handleChange}
                        />
                    </Field>
                </div>

                <button type="submit" className="button login-card__submit" disabled={busy}>
                    {busy ? 'Signing in…' : 'Sign in'}
                </button>
            </form>
        </main>
    );
}
