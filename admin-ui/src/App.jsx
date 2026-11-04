import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext';
import { WeekProvider } from './context/WeekContext';
import { ToastProvider } from './context/ToastContext';
import AppLayout from './components/layout/AppLayout';
import RequireAuth from './components/layout/RequireAuth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import RidersPage from './pages/RidersPage';
import BikesPage from './pages/BikesPage';
import DocumentHubPage from './pages/DocumentHubPage';
import DailyKmPage from './pages/DailyKmPage';
import BillingPage from './pages/BillingPage';
import PayoutsPage from './pages/PayoutsPage';
import NotFoundPage from './pages/NotFoundPage';

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
                                    <Route path="documents" element={<DocumentHubPage />} />
                                    <Route path="daily-km" element={<DailyKmPage />} />
                                    <Route path="billing" element={<BillingPage />} />
                                    <Route path="payouts" element={<PayoutsPage />} />
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
