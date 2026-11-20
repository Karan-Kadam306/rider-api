import { useState } from 'react';

import { assignTeamLeader, getRiderTeamLeaders, getTeamLeaders, removeTeamLeader } from '../../api/teamLeadersApi';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import ErrorState from '../../components/feedback/ErrorState';
import Icon from '../../components/ui/Icon';

// Who follows up with this rider. Admins and staff can see it; only admins add or remove.
// A rider can have several team leaders.
export default function TeamLeadersPanel({ rider, isAdmin }) {
    const showToast = useToast();
    // Bumped after a change, so the list reloads; the picker's rider counts reload with it.
    const [reloadKey, setReloadKey] = useState(0);
    const [selected, setSelected] = useState('');
    const [busy, setBusy] = useState(false);

    const current = useApi(options => getRiderTeamLeaders(rider.riderId, options), [rider.riderId, reloadKey]);
    // Staff cannot list team leaders (admins only), so only admins load the picker.
    const choices = useApi(options => (isAdmin ? getTeamLeaders(options) : Promise.resolve([])), [isAdmin, reloadKey]);

    const assignedIds = new Set((current.data ?? []).map(leader => leader.userId));
    const available = (choices.data ?? []).filter(leader => !assignedIds.has(leader.userId));
    const canAdd = isAdmin && rider.status !== 'Terminated';

    async function run(action, message) {
        setBusy(true);

        try {
            await action();
            showToast({ message });
            setSelected('');
            setReloadKey(key => key + 1);
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        } finally {
            setBusy(false);
        }
    }

    function handleAdd(event) {
        event.preventDefault();
        const leader = available.find(item => String(item.userId) === selected);

        if (leader) {
            run(() => assignTeamLeader(rider.riderId, leader.userId), `${leader.name} now leads ${rider.name}`);
        }
    }

    return (
        <section className="card panel">
            <div className="panel__header">
                <h3 className="panel__title">Team leaders</h3>
                <span className="panel__meta">Follow up on dues and performance</span>
            </div>

            {current.error && <ErrorState title="Could not load team leaders" error={current.error} onRetry={current.retry} />}

            {current.data && (
                current.data.length ? (
                    <div className="mapping-chips">
                        {current.data.map(leader => (
                            <span key={leader.userId} className="mapping-chip" title={leader.email}>
                                {leader.name}
                                {!leader.isActive && <span className="muted">(inactive)</span>}
                                {isAdmin && (
                                    <button
                                        type="button"
                                        className="mapping-chip__remove"
                                        aria-label={`Remove ${leader.name}`}
                                        disabled={busy}
                                        onClick={() => run(
                                            () => removeTeamLeader(rider.riderId, leader.userId),
                                            `${leader.name} no longer leads ${rider.name}`
                                        )}
                                    >
                                        <Icon name="close" size={13} />
                                    </button>
                                )}
                            </span>
                        ))}
                    </div>
                ) : (
                    <p className="muted">No team leader assigned.</p>
                )
            )}

            {canAdd && choices.data && (
                available.length ? (
                    <form className="tl-picker" onSubmit={handleAdd}>
                        <label className="visually-hidden" htmlFor="tl-picker">Team leader to add</label>
                        <select
                            id="tl-picker"
                            className="select"
                            value={selected}
                            onChange={event => setSelected(event.target.value)}
                        >
                            <option value="">Choose a team leader…</option>
                            {available.map(leader => (
                                <option key={leader.userId} value={leader.userId}>
                                    {leader.name} · {leader.riderCount} {leader.riderCount === 1 ? 'rider' : 'riders'}
                                </option>
                            ))}
                        </select>
                        <button type="submit" className="button button--small" disabled={!selected || busy}>
                            <Icon name="plus" size={15} />
                            Add
                        </button>
                    </form>
                ) : (
                    <p className="muted">
                        {choices.data.length
                            ? 'Every team leader already leads this rider.'
                            : 'No team leaders yet. Add one on the Users page with the Team leader role.'}
                    </p>
                )
            )}
        </section>
    );
}
