import { NavLink } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import Icon from '../ui/Icon';
import { NAV_ITEMS } from './navItems';

function NavItem({ item }) {
    return (
        <NavLink
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
                `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
            }
        >
            <Icon name={item.icon} />
            <span>{item.label}</span>
        </NavLink>
    );
}

export default function Sidebar() {
    const { isAdmin } = useAuth();
    const adminItems = isAdmin ? NAV_ITEMS.filter(item => item.adminOnly) : [];

    return (
        <aside className="sidebar">
            <div className="sidebar__brand">
                <span className="sidebar__logo">R</span>
                Rider Admin
            </div>
            <nav className="sidebar__nav" aria-label="Main">
                <p className="sidebar__section">Management</p>
                {NAV_ITEMS.filter(item => !item.adminOnly).map(item => (
                    <NavItem key={item.to} item={item} />
                ))}
                {adminItems.length > 0 && (
                    <>
                        <p className="sidebar__section sidebar__section--spaced">Administration</p>
                        {adminItems.map(item => <NavItem key={item.to} item={item} />)}
                    </>
                )}
            </nav>
        </aside>
    );
}
