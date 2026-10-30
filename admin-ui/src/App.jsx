import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { WeekProvider } from './context/WeekContext';
import { ToastProvider } from './context/ToastContext';
import AppLayout from './components/layout/AppLayout';
import DashboardPage from './pages/DashboardPage';
import RidersPage from './pages/RidersPage';
import BikesPage from './pages/BikesPage';
import DailyKmPage from './pages/DailyKmPage';
import BillingPage from './pages/BillingPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
    return (
        <WeekProvider>
            <ToastProvider>
                <BrowserRouter>
                    <Routes>
                        <Route element={<AppLayout />}>
                            <Route index element={<DashboardPage />} />
                            <Route path="riders" element={<RidersPage />} />
                            <Route path="bikes" element={<BikesPage />} />
                            <Route path="daily-km" element={<DailyKmPage />} />
                            <Route path="billing" element={<BillingPage />} />
                            <Route path="*" element={<NotFoundPage />} />
                        </Route>
                    </Routes>
                </BrowserRouter>
            </ToastProvider>
        </WeekProvider>
    );
}
