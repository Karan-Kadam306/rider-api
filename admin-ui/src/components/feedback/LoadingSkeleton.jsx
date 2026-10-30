// Grey placeholders shaped like a card or a table while data loads.
export default function LoadingSkeleton({ variant = 'card', rows = 4 }) {
    if (variant === 'table') {
        return (
            <div className="card skeleton-table" aria-busy="true" aria-label="Loading">
                <div className="skeleton skeleton--title" />
                {Array.from({ length: rows }, (_, index) => (
                    <div key={index} className="skeleton skeleton--row" />
                ))}
            </div>
        );
    }

    return (
        <div className="card stat-card" aria-busy="true" aria-label="Loading">
            <div className="skeleton skeleton--label" />
            <div className="skeleton skeleton--value" />
            <div className="skeleton skeleton--sub" />
        </div>
    );
}
