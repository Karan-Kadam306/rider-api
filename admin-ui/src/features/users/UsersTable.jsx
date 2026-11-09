import Icon from '../../components/ui/Icon';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatDate, formatRelativeTime } from '../../utils/formatDate';

// "Priya Sharma" → its initials for the avatar; a single name gives one letter.
function initials(name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase();
}

// Users for one status tab. Your own row cannot be deactivated or have its password reset here
// (use Change password in the top bar instead).
export default function UsersTable({ users, currentUserId, onEdit, onResetPassword, onToggleActive }) {
    return (
        <div className="table-wrap">
            <table className="table table--roomy">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Last sign-in</th>
                        <th>Created</th>
                        <th className="actions-col">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(user => {
                        const isSelf = user.userId === currentUserId;

                        return (
                            <tr key={user.userId}>
                                <td>
                                    <div className="person">
                                        <span className="avatar">{initials(user.name)}</span>
                                        <span className="person__name">{user.name}</span>
                                        {isSelf && <span className="badge badge--neutral">You</span>}
                                    </div>
                                </td>
                                <td>{user.email}</td>
                                <td>
                                    <span className={`badge badge--${user.role === 'admin' ? 'info' : 'neutral'} badge--capitalize`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td><StatusBadge status={user.isActive ? 'Active' : 'Inactive'} /></td>
                                <td className="muted">
                                    {user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : 'Never'}
                                </td>
                                <td className="muted">{formatDate(user.createdAt)}</td>
                                <td className="actions-col">
                                    <div className="row-actions">
                                        <button type="button" className="pill-button" onClick={() => onEdit(user)}>
                                            <Icon name="edit" size={15} />
                                            Edit
                                        </button>
                                        {!isSelf && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="pill-button"
                                                    onClick={() => onResetPassword(user)}
                                                >
                                                    <Icon name="key" size={15} />
                                                    Reset password
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`pill-button${user.isActive ? ' pill-button--danger' : ''}`}
                                                    onClick={() => onToggleActive(user)}
                                                >
                                                    <Icon name={user.isActive ? 'userX' : 'userCheck'} size={15} />
                                                    {user.isActive ? 'Deactivate' : 'Activate'}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
