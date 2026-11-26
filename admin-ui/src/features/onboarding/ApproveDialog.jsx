import { useEffect, useRef, useState } from 'react';

import { getApprovalOptions } from '../../api/onboardingApi';
import { useApi } from '../../hooks/useApi';
import Field from '../../components/ui/Field';
import CurrencyText from '../../components/ui/CurrencyText';

const MAX_NOTE_LENGTH = 500;

// Approves an application: creates the rider at the chosen hub, with optional team leaders and
// partner IDs. The plan and deposit are the rider's own choice, shown here for reference.
// Mounted only while open. onSubmit(body) must return a promise; its rejection message is shown here.
export default function ApproveDialog({ application, onSubmit, onClose }) {
    const dialogRef = useRef(null);
    const options = useApi(requestOptions => getApprovalOptions(requestOptions), []);
    const [hubId, setHubId] = useState('');
    const [teamLeaderIds, setTeamLeaderIds] = useState([]);
    // Partner ID typed for each partner, by partnerId; empty ones are left out.
    const [partnerIds, setPartnerIds] = useState({});
    const [note, setNote] = useState('');
    const [hubError, setHubError] = useState(null);
    const [serverError, setServerError] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        dialogRef.current.showModal();
    }, []);

    // With a single active hub there is nothing to choose.
    const onlyHub = options.data?.hubs.length === 1 ? String(options.data.hubs[0].hubId) : '';
    const selectedHubId = hubId || onlyHub;

    function toggleLeader(userId) {
        setTeamLeaderIds(current => (current.includes(userId) ? current.filter(id => id !== userId) : [...current, userId]));
    }

    async function handleSubmit(event) {
        event.preventDefault();

        if (!selectedHubId) {
            setHubError('Choose the hub the rider will collect their bike from');
            return;
        }

        setBusy(true);
        setServerError(null);

        try {
            await onSubmit({
                hubId: Number(selectedHubId),
                teamLeaderIds,
                mappings: Object.entries(partnerIds)
                    .filter(([, partnerRiderId]) => partnerRiderId.trim())
                    .map(([partnerId, partnerRiderId]) => ({ partnerId: Number(partnerId), partnerRiderId: partnerRiderId.trim() })),
                note: note.trim() || undefined
            });
        } catch (error) {
            // Stay open with the error; on success the parent unmounts this dialog, so busy needs no reset.
            setServerError(error.message);
            setBusy(false);
        }
    }

    function handleCancel(event) {
        // Escape key; ignore it while saving.
        event.preventDefault();

        if (!busy) {
            onClose();
        }
    }

    const { plan } = application;

    return (
        <dialog ref={dialogRef} className="dialog dialog--wide" onCancel={handleCancel}>
            <form onSubmit={handleSubmit} noValidate>
                <h3 className="dialog__title">Approve {application.profile.firstName} {application.profile.surname}</h3>
                <p className="cell-sub">
                    Creates the rider with a new rider code. They pay the deposit in the app, then collect their bike from the hub.
                </p>

                {serverError && <p className="form-alert" role="alert">{serverError}</p>}
                {options.error && <p className="form-alert" role="alert">Could not load hubs and team leaders: {options.error.message}</p>}

                <dl className="detail-list">
                    <div>
                        <dt>Plan</dt>
                        <dd>{plan.planType}{plan.pack && ` · ${plan.pack.name}`}</dd>
                    </div>
                    <div>
                        <dt>Deposit</dt>
                        <dd>{plan.depositAmount === null ? 'Not set' : <CurrencyText value={plan.depositAmount} />}</dd>
                    </div>
                </dl>

                <div className="form-fields">
                    <Field label="Hub" error={hubError}>
                        <select
                            value={selectedHubId}
                            onChange={event => {
                                setHubId(event.target.value);
                                setHubError(null);
                            }}
                        >
                            <option value="">Choose a hub…</option>
                            {options.data?.hubs.map(hub => (
                                <option key={hub.hubId} value={hub.hubId}>{hub.name} · {hub.city}</option>
                            ))}
                        </select>
                    </Field>

                    {options.data?.teamLeaders.length > 0 && (
                        <Field label="Team leaders (optional)">
                            <div className="review-steps">
                                {options.data.teamLeaders.map(leader => (
                                    <label key={leader.userId} className="checkbox">
                                        <input
                                            type="checkbox"
                                            checked={teamLeaderIds.includes(leader.userId)}
                                            onChange={() => toggleLeader(leader.userId)}
                                        />
                                        {leader.name} <span className="muted">({leader.riderCount} riders)</span>
                                    </label>
                                ))}
                            </div>
                        </Field>
                    )}

                    {options.data?.partners.map(partner => (
                        <Field key={partner.partnerId} label={`${partner.name} rider ID (optional)`}>
                            <input
                                className="mono"
                                value={partnerIds[partner.partnerId] ?? ''}
                                onChange={event => setPartnerIds(current => ({ ...current, [partner.partnerId]: event.target.value }))}
                                maxLength={100}
                            />
                        </Field>
                    ))}

                    <Field label="Internal note (optional)">
                        <textarea
                            rows={2}
                            maxLength={MAX_NOTE_LENGTH}
                            value={note}
                            onChange={event => setNote(event.target.value)}
                            placeholder="Seen by staff only"
                        />
                    </Field>
                </div>

                <div className="dialog__actions">
                    <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button" disabled={busy || !options.data}>
                        {busy ? 'Approving…' : 'Approve'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
