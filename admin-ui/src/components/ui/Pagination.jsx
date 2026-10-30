import Icon from './Icon';

// "Showing 21–40 of 57" plus previous / next, driven by the API's pagination block.
export default function Pagination({ page, limit, totalRecords, totalPages, onPageChange }) {
    if (!totalRecords) {
        return null;
    }

    const first = (page - 1) * limit + 1;
    const last = Math.min(page * limit, totalRecords);

    return (
        <div className="pagination">
            <span className="pagination__summary">
                Showing <strong>{first}–{last}</strong> of <strong>{totalRecords}</strong>
            </span>
            <div className="pagination__controls">
                <button
                    type="button"
                    className="button button--secondary button--small"
                    disabled={page <= 1}
                    onClick={() => onPageChange(page - 1)}
                >
                    <Icon name="chevronLeft" size={15} />
                    Previous
                </button>
                <span className="pagination__page">
                    Page {page} of {Math.max(totalPages, 1)}
                </span>
                <button
                    type="button"
                    className="button button--secondary button--small"
                    disabled={page >= totalPages}
                    onClick={() => onPageChange(page + 1)}
                >
                    Next
                    <Icon name="chevronRight" size={15} />
                </button>
            </div>
        </div>
    );
}
