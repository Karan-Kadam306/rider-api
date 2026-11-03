import { NavLink } from 'react-router-dom';

import Icon from '../ui/Icon';
import { NAV_ITEMS } from './navItems';

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
