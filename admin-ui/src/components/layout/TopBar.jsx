import { useState } from 'react';
import { useLocation } from 'react-router-dom';

import { changePassword } from '../../api/authApi';
import { useToast } from '../../context/ToastContext';
import ChangePasswordDialog from '../../features/account/ChangePasswordDialog';

import { useAuth } from '../../context/AuthContext';
import { useWeek } from '../../context/WeekContext';
import { NAV_ITEMS } from './navItems';
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
    const { user, signOut } = useAuth();
    const showToast = useToast();
    const [changingPassword, setChangingPassword] = useState(false);
    const navItem = findNavItem(pathname);

    async function handleChangePassword(values) {
        await changePassword(values);
        setChangingPassword(false);
        showToast({ message: 'Password changed. Other browsers were signed out.' });
    }

    return (
        <header className="top-bar">
            <h1 className="top-bar__title">{navItem?.label ?? 'Not found'}</h1>
            <div className="top-bar__actions">
                {navItem?.usesWeek && <WeekPicker />}
                <button type="button" className="button button--secondary" onClick={refresh}>
                    <Icon name="refresh" size={16} />
                    Refresh
                </button>
                <div className="top-bar__user">
                    <span className="top-bar__user-name">{user.name}</span>
                    <span className="top-bar__user-role">{user.role}</span>
                </div>
                <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => setChangingPassword(true)}
                >
                    <Icon name="key" size={16} />
                    Change password
                </button>
                <button type="button" className="button button--secondary" onClick={signOut}>
                    <Icon name="logOut" size={16} />
                    Sign out
                </button>
            </div>
            {changingPassword && (
                <ChangePasswordDialog onSubmit={handleChangePassword} onClose={() => setChangingPassword(false)} />
            )}
        </header>
    );
}
