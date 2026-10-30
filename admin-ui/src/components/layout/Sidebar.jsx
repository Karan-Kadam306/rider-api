import { NavLink } from 'react-router-dom';

import Icon from '../ui/Icon';

// Also used by TopBar for the page title and whether to show the week picker.
export const NAV_ITEMS = [
    { to: '/', label: 'Dashboard', icon: 'dashboard', end: true, usesWeek: true },
    { to: '/riders', label: 'Rider Management', icon: 'users' },
    { to: '/bikes', label: 'Bike Management', icon: 'bike' },
    { to: '/daily-km', label: 'Daily KM', icon: 'gauge', usesWeek: true },
    { to: '/billing', label: 'Billing', icon: 'rupee', usesWeek: true }
];

export default function Sidebar() {
    return (
        <aside className="sidebar">
            <div className="sidebar__brand">
                <span className="sidebar__logo">R</span>
                Rider Admin
            </div>
            <nav className="sidebar__nav" aria-label="Main">
                <p className="sidebar__section">Management</p>
                {NAV_ITEMS.map(item => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                            `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
                        }
                    >
                        <Icon name={item.icon} />
                        <span>{item.label}</span>
                    </NavLink>
                ))}
            </nav>
        </aside>
    );
}
