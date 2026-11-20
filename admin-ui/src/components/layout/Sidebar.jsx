import { NavLink } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import { useQueueAlerts } from '../../hooks/useQueueAlerts';
import Icon from '../ui/Icon';
import { getNavItems } from './navItems';

// One sidebar link. NavLink reports whether it matches the current page, for the highlight.
// badge is a count shown after the label, e.g. riders in the critical queue.
function NavItem({ item, badge }) {
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
            {badge > 0 && <span className="sidebar__badge" aria-label={`${badge} riders`}>{badge}</span>}
        </NavLink>
    );
}

// Links come from navItems (team leaders get their own short list); the Administration section
// only appears for admins.
export default function Sidebar() {
    const { user, isAdmin, isTeamLeader } = useAuth();
    const navItems = getNavItems(user);
    const adminItems = isAdmin ? navItems.filter(item => item.adminOnly) : [];
    // The sidebar is on every page, so the queue check (badge and toasts) runs from here.
    const queueCount = useQueueAlerts(isTeamLeader);

    return (
        <aside className="sidebar">
            <div className="sidebar__brand">
                <span className="sidebar__logo">R</span>
                Rider Admin
            </div>
            <nav className="sidebar__nav" aria-label="Main">
                <p className="sidebar__section">Management</p>
                {navItems.filter(item => !item.adminOnly).map(item => (
                    <NavItem key={item.to} item={item} badge={item.showsQueueCount ? queueCount : null} />
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
