// Sidebar links. TopBar also uses them for the page title and whether to show the week picker.
// adminOnly items are listed under Administration and shown to admins only.
export const NAV_ITEMS = [
    { to: '/', label: 'Dashboard', icon: 'dashboard', end: true, usesWeek: true },
    // Analytics ends its range at the selected week.
    { to: '/analytics', label: 'Analytics', icon: 'chart', usesWeek: true },
    { to: '/riders', label: 'Rider Management', icon: 'users' },
    { to: '/bikes', label: 'Bike Management', icon: 'bike' },
    { to: '/partner-mappings', label: 'Partner Mappings', icon: 'link' },
    { to: '/pending-earnings', label: 'Pending Earnings', icon: 'clock' },
    { to: '/documents', label: 'Document Hub', icon: 'file' },
    // Daily KM has its own date range (defaulting to the selected week), so no week picker.
    { to: '/daily-km', label: 'Daily KM', icon: 'gauge' },
    { to: '/billing', label: 'Billing', icon: 'rupee', usesWeek: true },
    { to: '/payouts', label: 'Payouts', icon: 'wallet', usesWeek: true },
    { to: '/users', label: 'Users', icon: 'shield', adminOnly: true }
];

// Team leaders see only their own riders; the critical queue is their home page.
// alsoMatches gives the rider page the same title.
export const TEAM_LEADER_NAV_ITEMS = [
    { to: '/queue', label: 'Critical Queue', icon: 'shield', showsQueueCount: true },
    { to: '/my-riders', label: 'My Riders', icon: 'users', alsoMatches: ['/riders/'] }
];

export function getNavItems(user) {
    return user?.role === 'team_leader' ? TEAM_LEADER_NAV_ITEMS : NAV_ITEMS;
}

// The nav item for the current URL. No match means the not-found page.
export function findNavItem(items, pathname) {
    return items.find(nav =>
        nav.end
            ? pathname === nav.to
            : [nav.to, ...(nav.alsoMatches ?? [])].some(path => pathname.startsWith(path))
    );
}
