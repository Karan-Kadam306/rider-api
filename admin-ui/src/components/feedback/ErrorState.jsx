// Inline card for a failed load. Pass onRetry (usually useApi retry) to offer a Retry button.
export default function ErrorState({ title = 'Something went wrong', error, onRetry }) {
    return (
        <div className="card state state--error" role="alert">
            <h3 className="state__title">{title}</h3>
            {error?.message && <p className="state__message">{error.message}</p>}
            {onRetry && (
                <button type="button" className="button button--secondary" onClick={onRetry}>
                    Retry
                </button>
            )}
        </div>
    );
}
