// Sidebar links. TopBar also uses them for the page title and whether to show the week picker.
export const NAV_ITEMS = [
    { to: '/', label: 'Dashboard', icon: 'dashboard', end: true, usesWeek: true },
    { to: '/riders', label: 'Rider Management', icon: 'users' },
    { to: '/bikes', label: 'Bike Management', icon: 'bike' },
    { to: '/documents', label: 'Document Hub', icon: 'file' },
    // Daily KM has its own date range (defaulting to the selected week), so no week picker.
    { to: '/daily-km', label: 'Daily KM', icon: 'gauge' },
    { to: '/billing', label: 'Billing', icon: 'rupee', usesWeek: true },
    { to: '/payouts', label: 'Payouts', icon: 'wallet', usesWeek: true }
];
