import { useState } from 'react';

import { createHub, getHubs, updateHub } from '../api/hubsApi';
import { useApi } from '../hooks/useApi';
import { useWeek } from '../context/WeekContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import Icon from '../components/ui/Icon';
import HubsTable from '../features/hubs/HubsTable';
import HubFormDialog from '../features/hubs/HubFormDialog';

// Admins add the hubs riders join at and bikes are kept at. There are only a few, so one list.
export default function HubsPage() {
    const { refreshKey } = useWeek();
    const showToast = useToast();

    // Bumped after a change on this page to refetch; refreshKey does the same for the top bar's Refresh.
    const [reloadKey, setReloadKey] = useState(0);
    // null = closed, { hub: null } = add, { hub } = edit
    const [formState, setFormState] = useState(null);

    const list = useApi(options => getHubs(options), [refreshKey, reloadKey]);

    const reload = () => setReloadKey(key => key + 1);

    // Errors are not caught here: they reject back to the dialog, which shows them.
    async function handleSave(values) {
        if (formState.hub) {
            await updateHub(formState.hub.hubId, values);
            showToast({ message: `${values.name} updated` });
        } else {
            await createHub(values);
            showToast({ message: `${values.name} added` });
        }

        setFormState(null);
        reload();
    }

    async function handleToggleActive(hub) {
        try {
            await updateHub(hub.hubId, { isActive: !hub.isActive });
            showToast({ message: `${hub.name} is now ${hub.isActive ? 'inactive' : 'active'}` });
            reload();
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        }
    }

    return (
        <>
            <PageHeader
                breadcrumbs={[{ label: 'Administration' }, { label: 'Hubs' }]}
                title="Hub Management"
                subtitle="The hubs riders join at and bikes are kept at. Inactive hubs cannot get new bikes."
                actions={
                    <button type="button" className="button" onClick={() => setFormState({ hub: null })}>
                        <Icon name="plus" size={16} />
                        Add hub
                    </button>
                }
            />

            {list.loading && <LoadingSkeleton variant="table" rows={4} />}

            {list.error && <ErrorState title="Could not load hubs" error={list.error} onRetry={list.retry} />}

            {list.data && (
                <section className="card card--flush">
                    {list.data.length ? (
                        <HubsTable
                            hubs={list.data}
                            onEdit={hub => setFormState({ hub })}
                            onToggleActive={handleToggleActive}
                        />
                    ) : (
                        <div className="card__empty">
                            <EmptyState message="No hubs yet. Add one before adding bikes." />
                        </div>
                    )}
                </section>
            )}

            {formState && (
                <HubFormDialog hub={formState.hub} onSubmit={handleSave} onClose={() => setFormState(null)} />
            )}
        </>
    );
}
