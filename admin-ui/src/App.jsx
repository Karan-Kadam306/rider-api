import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext';
import { WeekProvider } from './context/WeekContext';
import { ToastProvider } from './context/ToastContext';
import AppLayout from './components/layout/AppLayout';
import RequireAuth from './components/layout/RequireAuth';
import RequireAdmin from './components/layout/RequireAdmin';
import RequireStaff from './components/layout/RequireStaff';
import RequireTeamLeader from './components/layout/RequireTeamLeader';
import LoginPage from './pages/LoginPage';
import MockPayPage from './pages/MockPayPage';
import DashboardPage from './pages/DashboardPage';
import AnalyticsPage from './pages/AnalyticsPage';
import RidersPage from './pages/RidersPage';
import RiderDetailPage from './pages/RiderDetailPage';
import BikesPage from './pages/BikesPage';
import PartnerMappingsPage from './pages/PartnerMappingsPage';
import PendingEarningsPage from './pages/PendingEarningsPage';
import DocumentHubPage from './pages/DocumentHubPage';
import DailyKmPage from './pages/DailyKmPage';
import BillingPage from './pages/BillingPage';
import PayoutsPage from './pages/PayoutsPage';
import UsersPage from './pages/UsersPage';
import MyRidersPage from './pages/MyRidersPage';
import NotFoundPage from './pages/NotFoundPage';

// Providers sit above the router so every page can reach the user, selected week and toasts.
// Route nesting adds the guards: only /login and the mock rider payment page are public,
// RequireAuth covers the rest, AppLayout adds the sidebar and top bar, and RequireAdmin limits /users to admins.
// Team leaders only get My Riders and their riders' pages; RequireStaff sends them there from anywhere else.
export default function App() {
    return (
        <AuthProvider>
            <WeekProvider>
                <ToastProvider>
                    <BrowserRouter>
                        <Routes>
                            <Route path="login" element={<LoginPage />} />
                            <Route path="mock-pay/:token" element={<MockPayPage />} />
                            <Route element={<RequireAuth />}>
                                <Route element={<AppLayout />}>
                                    <Route element={<RequireStaff />}>
                                        <Route index element={<DashboardPage />} />
                                        <Route path="analytics" element={<AnalyticsPage />} />
                                        <Route path="riders" element={<RidersPage />} />
                                        <Route path="bikes" element={<BikesPage />} />
                                        <Route path="partner-mappings" element={<PartnerMappingsPage />} />
                                        <Route path="pending-earnings" element={<PendingEarningsPage />} />
                                        <Route path="documents" element={<DocumentHubPage />} />
                                        <Route path="daily-km" element={<DailyKmPage />} />
                                        <Route path="billing" element={<BillingPage />} />
                                        <Route path="payouts" element={<PayoutsPage />} />
                                        <Route element={<RequireAdmin />}>
                                            <Route path="users" element={<UsersPage />} />
                                        </Route>
                                    </Route>
                                    <Route element={<RequireTeamLeader />}>
                                        <Route path="my-riders" element={<MyRidersPage />} />
                                    </Route>
                                    {/* Shared: the API lets a team leader open only their own riders. */}
                                    <Route path="riders/:riderId" element={<RiderDetailPage />} />
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
