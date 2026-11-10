import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext';
import { WeekProvider } from './context/WeekContext';
import { ToastProvider } from './context/ToastContext';
import AppLayout from './components/layout/AppLayout';
import RequireAuth from './components/layout/RequireAuth';
import RequireAdmin from './components/layout/RequireAdmin';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import RidersPage from './pages/RidersPage';
import BikesPage from './pages/BikesPage';
import PartnerMappingsPage from './pages/PartnerMappingsPage';
import DocumentHubPage from './pages/DocumentHubPage';
import DailyKmPage from './pages/DailyKmPage';
import BillingPage from './pages/BillingPage';
import PayoutsPage from './pages/PayoutsPage';
import UsersPage from './pages/UsersPage';
import NotFoundPage from './pages/NotFoundPage';

// Providers sit above the router so every page can reach the user, selected week and toasts.
// Route nesting adds the guards: only /login is public, RequireAuth covers the rest,
// AppLayout adds the sidebar and top bar, and RequireAdmin limits /users to admins.
export default function App() {
    return (
        <AuthProvider>
            <WeekProvider>
                <ToastProvider>
                    <BrowserRouter>
                        <Routes>
                            <Route path="login" element={<LoginPage />} />
                            <Route element={<RequireAuth />}>
                                <Route element={<AppLayout />}>
                                    <Route index element={<DashboardPage />} />
                                    <Route path="riders" element={<RidersPage />} />
                                    <Route path="bikes" element={<BikesPage />} />
                                    <Route path="partner-mappings" element={<PartnerMappingsPage />} />
                                    <Route path="documents" element={<DocumentHubPage />} />
                                    <Route path="daily-km" element={<DailyKmPage />} />
                                    <Route path="billing" element={<BillingPage />} />
                                    <Route path="payouts" element={<PayoutsPage />} />
                                    <Route element={<RequireAdmin />}>
                                        <Route path="users" element={<UsersPage />} />
                                    </Route>
                                    <Route path="*" element={<NotFoundPage />} />
                                </Route>
                            </Route>
                        </Routes>
                    </BrowserRouter>
                </ToastProvider>
            </WeekProvider>
        </AuthProvider>
    );
}
