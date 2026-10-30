import { useLocation } from 'react-router-dom';

import { useWeek } from '../../context/WeekContext';
import { NAV_ITEMS } from './Sidebar';
import WeekPicker from './WeekPicker';
import Icon from '../ui/Icon';

function findNavItem(pathname) {
    return NAV_ITEMS.find(nav =>
        nav.end ? pathname === nav.to : pathname.startsWith(nav.to)
    );
}

export default function TopBar() {
    const { pathname } = useLocation();
    const { refresh } = useWeek();
    const navItem = findNavItem(pathname);

    return (
        <header className="top-bar">
            <h1 className="top-bar__title">{navItem?.label ?? 'Not found'}</h1>
            <div className="top-bar__actions">
                {navItem?.usesWeek && <WeekPicker />}
                <button type="button" className="button button--secondary" onClick={refresh}>
                    <Icon name="refresh" size={16} />
                    Refresh
                </button>
            </div>
        </header>
    );
}
