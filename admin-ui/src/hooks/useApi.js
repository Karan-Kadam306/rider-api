import { useCallback, useEffect, useState } from 'react';

// Runs fetcher({ signal }) whenever deps change; stale responses are aborted.
// deps must be plain values (strings, numbers): together they identify the request.
export function useApi(fetcher, deps) {
    const [attempt, setAttempt] = useState(0);
    const requestKey = JSON.stringify([...deps, attempt]);
    const [result, setResult] = useState({ key: null, data: null, error: null });

    useEffect(() => {
        const controller = new AbortController();

        fetcher({ signal: controller.signal })
            .then(data => setResult({ key: requestKey, data, error: null }))
            .catch(error => {
                if (error.name !== 'AbortError') {
                    setResult({ key: requestKey, data: null, error });
                }
            });

        return () => controller.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestKey]);

    const retry = useCallback(() => setAttempt(count => count + 1), []);

    // Until the current request answers, report loading instead of the previous result.
    if (result.key !== requestKey) {
        return { data: null, loading: true, error: null, retry };
    }

    return { data: result.data, loading: false, error: result.error, retry };
}
