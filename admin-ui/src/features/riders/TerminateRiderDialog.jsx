import { useState } from 'react';

import { terminateRider } from '../../api/ridersApi';
import { useToast } from '../../context/ToastContext';
import ConfirmDialog from '../../components/feedback/ConfirmDialog';

// Confirm and terminate a rider, from the riders list or the rider page.
// rider: { rider_id, name } while open, null when closed. onTerminated runs after a success.
export default function TerminateRiderDialog({ rider, onTerminated, onCancel }) {
    const showToast = useToast();
    const [busy, setBusy] = useState(false);

    async function handleTerminate() {
        setBusy(true);

        try {
            const result = await terminateRider(rider.rider_id);
            // The API reports the bike it took back, if the rider held one.
            const bikeNote = result.returnedAssignment
                ? ` Bike ${result.returnedAssignment.registration_number ?? result.returnedAssignment.chassis_number} was returned.`
                : '';
            showToast({ message: `${rider.name} terminated.${bikeNote}` });
            onTerminated();
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        } finally {
            setBusy(false);
        }
    }

    return (
        <ConfirmDialog
            open={Boolean(rider)}
            title="Terminate rider?"
            message={rider && (
                <>
                    <p>
                        <strong>{rider.name}</strong> ({rider.rider_id}) will be terminated from today.
                        Any bike assigned to them will be returned.
                    </p>
                    <p>This cannot be undone.</p>
                </>
            )}
            confirmLabel="Terminate"
            busy={busy}
            onConfirm={handleTerminate}
            onCancel={onCancel}
        />
    );
}
