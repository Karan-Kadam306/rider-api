import { useEffect, useRef, useState } from 'react';

import { getMyQueue } from '../api/teamLeadersApi';
import { useToast } from '../context/ToastContext';

const POLL_INTERVAL_MS = 2 * 60 * 1000;

// For team leaders: checks the critical queue every few minutes and returns its size for the
// sidebar badge. A rider who was not in the queue at the last check gets a toast.
export function useQueueAlerts(enabled) {
    const showToast = useToast();
    const [count, setCount] = useState(null);
    // Rider IDs from the last check; null until the first one, so opening the app does not toast.
    const knownIds = useRef(null);

    useEffect(() => {
        if (!enabled) {
            return undefined;
        }

        const controller = new AbortController();

        async function check() {
            try {
                const { riders } = await getMyQueue({ signal: controller.signal });

                if (knownIds.current) {
                    const added = riders.filter(rider => !knownIds.current.has(rider.riderId));

                    if (added.length === 1) {
                        showToast({ type: 'error', message: `${added[0].name} needs attention: ${added[0].reasons[0].label}` });
                    } else if (added.length > 1) {
                        showToast({ type: 'error', message: `${added.length} riders joined your critical queue` });
                    }
                }

                knownIds.current = new Set(riders.map(rider => rider.riderId));
                setCount(riders.length);
            } catch {
                // Best effort: the queue page shows any error; the badge keeps its last count.
            }
        }

        check();
        const timer = setInterval(check, POLL_INTERVAL_MS);

        return () => {
            clearInterval(timer);
            controller.abort();
        };
    }, [enabled, showToast]);

    return count;
}
