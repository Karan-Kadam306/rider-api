import { useLocation } from 'react-router-dom';

import { useWeek } from '../../context/WeekContext';
import { NAV_ITEMS } from './Sidebar';
import WeekPicker from './WeekPicker';

function getPageTitle(pathname) {
    const item = NAV_ITEMS.find(nav =>
        nav.end ? pathname === nav.to : pathname.startsWith(nav.to)
    );
    return item?.label ?? 'Not found';
}

export default function TopBar() {
    const { pathname } = useLocation();
    const { refresh } = useWeek();

    return (
        <header className="top-bar">
            <h1 className="top-bar__title">{getPageTitle(pathname)}</h1>
            <div className="top-bar__actions">
                <WeekPicker />
                <button type="button" className="button button--secondary" onClick={refresh}>
                    Refresh
                </button>
            </div>
        </header>
    );
}
