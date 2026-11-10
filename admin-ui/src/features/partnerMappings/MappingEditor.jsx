import { useState } from 'react';

import Icon from '../../components/ui/Icon';

// The backend stores IDs trimmed and uppercase; compare the same way to spot changes.
function normalize(value) {
    return value.trim().toUpperCase();
}

// One row per partner: tick it and enter the ID that partner uses for this rider.
// onSave(mappings) must reject with the API error, which is shown here.
export default function MappingEditor({ rider, partners, onSave, onCancel }) {
    const [entries, setEntries] = useState(() => Object.fromEntries(partners.map(partner => {
        const mapping = rider.mappings.find(item => item.partnerId === partner.partnerId);
        return [partner.partnerId, { checked: Boolean(mapping), value: mapping?.partnerRiderId ?? '' }];
    })));
    const [showErrors, setShowErrors] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const selected = partners.filter(partner => entries[partner.partnerId].checked);
    const missingIds = selected.filter(partner => !entries[partner.partnerId].value.trim());

    const changesExisting = rider.mappings.some(mapping => {
        const entry = entries[mapping.partnerId];
        return !entry?.checked || normalize(entry.value) !== mapping.partnerRiderId;
    });
    const isChanged = changesExisting || selected.length !== rider.mappings.length;

    function updateEntry(partnerId, changes) {
        setEntries(current => ({ ...current, [partnerId]: { ...current[partnerId], ...changes } }));
        setError(null);
    }

    async function handleSubmit(event) {
        event.preventDefault();

        if (missingIds.length > 0) {
            setShowErrors(true);
            return;
        }

        setBusy(true);
        setError(null);

        try {
            await onSave(selected.map(partner => ({
                partnerId: partner.partnerId,
                partnerRiderId: entries[partner.partnerId].value
            })));
        } catch (saveError) {
            setError(saveError.message);
            setBusy(false);
        }
    }

    return (
        <form className="mapping-editor" onSubmit={handleSubmit} noValidate>
            <div className="mapping-editor__header">
                <h4 className="mapping-editor__title">Select partners to map</h4>
                <button type="button" className="button button--icon" onClick={onCancel} aria-label="Close">
                    <Icon name="close" size={16} />
                </button>
            </div>

            {partners.map(partner => {
                const entry = entries[partner.partnerId];
                const invalid = showErrors && entry.checked && !entry.value.trim();

                return (
                    <div
                        key={partner.partnerId}
                        className={`mapping-editor__row${entry.checked ? ' mapping-editor__row--selected' : ''}`}
                    >
                        <label className="checkbox mapping-editor__partner">
                            <input
                                type="checkbox"
                                checked={entry.checked}
                                onChange={event => updateEntry(partner.partnerId, { checked: event.target.checked })}
                            />
                            {partner.name}
                        </label>
                        <div className={`field${invalid ? ' field--invalid' : ''}`}>
                            <input
                                type="text"
                                value={entry.value}
                                maxLength={100}
                                placeholder={`Enter ${partner.name} rider ID…`}
                                aria-label={`${partner.name} rider ID`}
                                // Typing an ID selects the partner, so it is not lost on save.
                                onChange={event => updateEntry(partner.partnerId, {
                                    value: event.target.value,
                                    checked: entry.checked || event.target.value.trim() !== ''
                                })}
                            />
                            {invalid && <span className="field__error">Enter the {partner.name} rider ID</span>}
                        </div>
                    </div>
                );
            })}

            {changesExisting && (
                <p className="form-note muted">
                    Removed or changed IDs stop matching new earnings. Earnings already matched stay with {rider.name}.
                </p>
            )}

            {error && <p className="form-alert" role="alert">{error}</p>}

            <div className="mapping-editor__actions">
                <button type="button" className="button button--secondary" onClick={onCancel} disabled={busy}>
                    Cancel
                </button>
                <button type="submit" className="button" disabled={busy || !isChanged}>
                    {busy ? 'Saving…' : 'Save mappings'}
                </button>
            </div>
        </form>
    );
}
