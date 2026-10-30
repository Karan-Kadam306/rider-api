import { createContext, useCallback, useContext, useRef, useState } from 'react';

import Toast from '../components/feedback/Toast';

const TOAST_DURATION_MS = 4000;

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const nextId = useRef(1);

    const dismissToast = useCallback(id => {
        setToasts(list => list.filter(toast => toast.id !== id));
    }, []);

    const showToast = useCallback(({ type = 'success', message }) => {
        const id = nextId.current++;
        setToasts(list => [...list, { id, type, message }]);
        setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
    }, [dismissToast]);

    return (
        <ToastContext.Provider value={showToast}>
            {children}
            <Toast toasts={toasts} onDismiss={dismissToast} />
        </ToastContext.Provider>
    );
}

// Returns showToast({ type: 'success' | 'error', message }).
export function useToast() {
    const showToast = useContext(ToastContext);

    if (!showToast) {
        throw new Error('useToast must be used inside ToastProvider');
    }

    return showToast;
}
