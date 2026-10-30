import { useCallback, useEffect, useState } from 'react';

// Runs fetcher({ signal }) whenever deps change; stale responses are aborted.
export function useApi(fetcher, deps) {
    const [state, setState] = useState({ data: null, loading: true, error: null });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        setState({ data: null, loading: true, error: null });

        fetcher({ signal: controller.signal })
            .then(data => setState({ data, loading: false, error: null }))
            .catch(error => {
                if (error.name !== 'AbortError') {
                    setState({ data: null, loading: false, error });
                }
            });

        return () => controller.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, attempt]);

    const retry = useCallback(() => setAttempt(count => count + 1), []);

    return { ...state, retry };
}
