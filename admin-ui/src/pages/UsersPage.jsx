import { useState } from 'react';

import { createUser, getUsers, resetUserPassword, updateUser } from '../api/usersApi';
import { useApi } from '../hooks/useApi';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useAuth } from '../context/AuthContext';
import { useWeek } from '../context/WeekContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import ConfirmDialog from '../components/feedback/ConfirmDialog';
import Icon from '../components/ui/Icon';
import StatusTabs from '../components/ui/StatusTabs';
import UsersTable from '../features/users/UsersTable';
import UserFormDialog from '../features/users/UserFormDialog';
import ResetPasswordDialog from '../features/users/ResetPasswordDialog';

const USER_STATUSES = [
    { value: 'active', label: 'Active', icon: 'userCheck' },
    { value: 'inactive', label: 'Inactive', icon: 'userPause' }
];

// Admins add people who can sign in, set their role, reset passwords and deactivate them.
// The team is small, so the whole tab is one list (no pagination).
export default function UsersPage() {
    const { user: currentUser, reloadUser } = useAuth();
    const { refreshKey } = useWeek();
    const showToast = useToast();

    const [status, setStatus] = useState('active');
    const [searchInput, setSearchInput] = useState('');
    const search = useDebouncedValue(searchInput.trim());
    const [reloadKey, setReloadKey] = useState(0);
    // null = closed, { user: null } = add, { user } = edit
    const [formState, setFormState] = useState(null);
    const [resetting, setResetting] = useState(null);
    const [deactivating, setDeactivating] = useState(null);
    const [deactivateBusy, setDeactivateBusy] = useState(false);

    const list = useApi(options => getUsers({ status, search }, options), [status, search, refreshKey, reloadKey]);

    const reload = () => setReloadKey(key => key + 1);

    async function handleSave(values) {
        if (formState.user) {
            const target = formState.user;
            await updateUser(target.userId, values);
            showToast({ message: `${values.name} updated` });

            // Your own name is shown in the top bar.
            if (target.userId === currentUser.userId) {
                reloadUser();
            }
        } else {
            await createUser(values);
            showToast({ message: `${values.name} can now sign in as ${values.role}` });
        }

        setFormState(null);
        reload();
    }

    async function handleResetPassword(password) {
        await resetUserPassword(resetting.userId, password);
        showToast({ message: `Password reset for ${resetting.name}` });
        setResetting(null);
    }

    async function setActive(target, isActive) {
        await updateUser(target.userId, { isActive });
        showToast({ message: `${target.name} is now ${isActive ? 'active' : 'inactive'}` });
        reload();
    }

    async function handleToggleActive(target) {
        if (target.isActive) {
            setDeactivating(target);
            return;
        }

        try {
            await setActive(target, true);
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        }
    }

    async function handleDeactivate() {
        setDeactivateBusy(true);

        try {
            await setActive(deactivating, false);
            setDeactivating(null);
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        } finally {
            setDeactivateBusy(false);
        }
    }

    return (
        <>
            <PageHeader
                breadcrumbs={[{ label: 'Administration' }, { label: 'Users' }]}
                title="Users"
                subtitle="Manage who can sign in to the admin panel and what they can do."
                actions={
                    <button type="button" className="button" onClick={() => setFormState({ user: null })}>
                        <Icon name="plus" size={16} />
                        Add user
                    </button>
                }
            />

            <div className="search-box">
                <Icon name="search" />
                <input
                    type="search"
                    value={searchInput}
                    onChange={event => setSearchInput(event.target.value)}
                    placeholder="Search by name or email…"
                    aria-label="Search users"
                />
            </div>

            <StatusTabs
                label="User status"
                tabs={USER_STATUSES.map(item => ({ ...item, count: list.data?.counts[item.value] }))}
                value={status}
                onChange={setStatus}
            />

            {list.loading && <LoadingSkeleton variant="table" rows={5} />}

            {list.error && <ErrorState title="Could not load users" error={list.error} onRetry={list.retry} />}

            {list.data && (
                <section className="card card--flush">
                    {list.data.users.length ? (
                        <UsersTable
                            users={list.data.users}
                            currentUserId={currentUser.userId}
                            onEdit={target => setFormState({ user: target })}
                            onResetPassword={setResetting}
                            onToggleActive={handleToggleActive}
                        />
                    ) : (
                        <div className="card__empty">
                            <EmptyState
                                message={search ? `No ${status} users match “${search}”.` : `No ${status} users.`}
                            />
                        </div>
                    )}
                </section>
            )}

            {formState && (
                <UserFormDialog
                    user={formState.user}
                    isSelf={formState.user?.userId === currentUser.userId}
                    onSubmit={handleSave}
                    onClose={() => setFormState(null)}
                />
            )}

            {resetting && (
                <ResetPasswordDialog user={resetting} onSubmit={handleResetPassword} onClose={() => setResetting(null)} />
            )}

            <ConfirmDialog
                open={Boolean(deactivating)}
                title="Deactivate user?"
                message={deactivating && (
                    <p>
                        <strong>{deactivating.name}</strong> ({deactivating.email}) will be signed out everywhere
                        and cannot sign in until an admin activates them again.
                    </p>
                )}
                confirmLabel="Deactivate"
                busy={deactivateBusy}
                onConfirm={handleDeactivate}
                onCancel={() => setDeactivating(null)}
            />
        </>
    );
}
