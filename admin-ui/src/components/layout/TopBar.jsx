import { useState } from 'react';
import { useLocation } from 'react-router-dom';

import { changePassword } from '../../api/authApi';
import { useToast } from '../../context/ToastContext';
import ChangePasswordDialog from '../../features/account/ChangePasswordDialog';

import { useAuth } from '../../context/AuthContext';
import { useWeek } from '../../context/WeekContext';
import { useTheme } from '../../hooks/useTheme';
import { findNavItem, getNavItems } from './navItems';
import WeekPicker from './WeekPicker';
import Icon from '../ui/Icon';
import { roleLabel } from '../../utils/roleLabel';

// Page title, week picker (on pages that use it), Refresh, the signed-in user and account actions.
export default function TopBar() {
    const { pathname } = useLocation();
    const { refresh } = useWeek();
    const { user, signOut } = useAuth();
    const showToast = useToast();
    const { theme, toggleTheme } = useTheme();
    const [changingPassword, setChangingPassword] = useState(false);
    const navItem = findNavItem(getNavItems(user), pathname);
    const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

    // A failure rejects back to the dialog, which stays open and shows the message.
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
                <button
                    type="button"
                    className="button button--secondary theme-toggle"
                    onClick={toggleTheme}
                    aria-label={themeLabel}
                    title={themeLabel}
                >
                    <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
                </button>
                <div className="top-bar__user">
                    <span className="top-bar__user-name">{user.name}</span>
                    <span className="top-bar__user-role">{roleLabel(user.role)}</span>
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
