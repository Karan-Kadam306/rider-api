import { NavLink } from 'react-router-dom';

// Also used by TopBar to show the current page title.
export const NAV_ITEMS = [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/riders', label: 'Riders' },
    { to: '/bikes', label: 'Bikes' },
    { to: '/daily-km', label: 'Daily KM' },
    { to: '/billing', label: 'Billing' }
];

export default function Sidebar() {
    return (
        <aside className="sidebar">
            <div className="sidebar__brand">Rider Admin</div>
            <nav className="sidebar__nav" aria-label="Main">
                {NAV_ITEMS.map(item => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                            `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
                        }
                    >
                        {item.label}
                    </NavLink>
                ))}
            </nav>
        </aside>
    );
}
