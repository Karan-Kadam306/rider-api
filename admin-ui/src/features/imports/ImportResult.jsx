import StatusBadge from '../../components/ui/StatusBadge';

// Readable names for the per-type counts in resultSummary, in display order; unknown keys go last, as-is.
const SUMMARY_LABELS = {
    inserted: 'New',
    matched: 'Matched',
    pending: 'Pending review',
    corrected: 'Corrected',
    updated: 'Updated',
    unchanged: 'Unchanged',
    needsReview: 'Needs review'
};
const SUMMARY_ORDER = Object.keys(SUMMARY_LABELS);

function orderOf(key) {
    const index = SUMMARY_ORDER.indexOf(key);
    return index === -1 ? SUMMARY_ORDER.length : index;
}

// Status, "imported / total (failed)", the type's own counts and any file-level error.
export default function ImportResult({ batch }) {
    // The database (jsonb) does not keep key order, so sort for a stable layout.
    const summaryEntries = Object.entries(batch.resultSummary ?? {})
        .sort(([a], [b]) => orderOf(a) - orderOf(b));

    return (
        <div className="import-result">
            <div className="import-result__top">
                <StatusBadge status={batch.status} />
                <RowCounts batch={batch} />
            </div>

            {batch.errorMessage && <p className="form-alert">{batch.errorMessage}</p>}

            {summaryEntries.length > 0 && (
                <dl className="import-result__summary">
                    {summaryEntries.map(([key, value]) => (
                        <div key={key}>
                            <dt>{SUMMARY_LABELS[key] ?? key}</dt>
                            <dd>{value}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    );
}

// "2221 / 2235 (14 failed)" — also used in the Import History table.
export function RowCounts({ batch }) {
    return (
        <span className="row-counts">
            <span className="row-counts__ok">{batch.successRows}</span> / {batch.totalRows}
            {batch.failedRows > 0 && (
                <span className="row-counts__failed"> ({batch.failedRows} failed)</span>
            )}
        </span>
    );
}
