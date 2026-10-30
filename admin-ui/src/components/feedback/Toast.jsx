// Renders the toasts held by ToastContext.
export default function Toast({ toasts, onDismiss }) {
    return (
        <div className="toast-stack" role="status" aria-live="polite">
            {toasts.map(toast => (
                <div key={toast.id} className={`toast toast--${toast.type}`}>
                    <span>{toast.message}</span>
                    <button
                        type="button"
                        className="toast__close"
                        aria-label="Dismiss"
                        onClick={() => onDismiss(toast.id)}
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    );
}
