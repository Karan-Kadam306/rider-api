import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getImports, getImportSummary, getImportTypes } from '../api/importsApi';
import { useApi } from '../hooks/useApi';
import { useWeek } from '../context/WeekContext';
import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import Pagination from '../components/ui/Pagination';
import StatCard from '../components/ui/StatCard';
import UploadImportPanel from '../features/imports/UploadImportPanel';
import ImportHistoryTable from '../features/imports/ImportHistoryTable';
import ImportDetailsPanel from '../features/imports/ImportDetailsPanel';

const IMPORT_STATUSES = ['Completed', 'Partial', 'Failed'];
const PAGE_SIZE = 20;

// Upload CSV imports and see every past import with its result.
// Type, status and page live in the URL so a filtered view can be linked or reloaded.
export default function DocumentHubPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const type = searchParams.get('type') ?? '';
    const requestedStatus = searchParams.get('status');
    const status = IMPORT_STATUSES.includes(requestedStatus) ? requestedStatus : '';
    const page = Math.max(Number(searchParams.get('page')) || 1, 1);

    const { refreshKey } = useWeek();
    const [reloadKey, setReloadKey] = useState(0);
    const [viewingId, setViewingId] = useState(null);

    const types = useApi(options => getImportTypes(options), []);
    const summary = useApi(options => getImportSummary(options), [refreshKey, reloadKey]);
    const list = useApi(
        options => getImports({ type: type || undefined, status: status || undefined, page, limit: PAGE_SIZE }, options),
        [type, status, page, refreshKey, reloadKey]
    );

    const typeLabels = Object.fromEntries((types.data?.types ?? []).map(item => [item.key, item.label]));

    function updateParams(changes) {
        setSearchParams(current => {
            const next = new URLSearchParams(current);

            for (const [key, value] of Object.entries(changes)) {
                if (value === undefined || value === '' || value === null) {
                    next.delete(key);
                } else {
                    next.set(key, value);
                }
            }

            return next;
        }, { replace: true });
    }

    // A new upload is the newest import, so show page 1 of the unfiltered history.
    function handleUploaded() {
        updateParams({ type: undefined, status: undefined, page: undefined });
        setReloadKey(key => key + 1);
    }

    return (
        <>
            <PageHeader
                breadcrumbs={[{ label: 'Documents', to: '/documents' }, { label: 'Document Hub' }]}
                title="Document Hub"
                subtitle="Upload CSV data imports and review their results."
            />

            <div className="card-grid">
                {summary.loading && Array.from({ length: 4 }, (_, index) => <LoadingSkeleton key={index} />)}

                {summary.data && (
                    <>
                        <StatCard
                            label="Total imports"
                            value={summary.data.totalImports}
                            subText={`${summary.data.completedImports} completed`}
                        />
                        <StatCard
                            label="Rows processed"
                            value={summary.data.totalRows}
                            subText={`${summary.data.successRows} successful`}
                        />
                        <StatCard
                            label="Failed imports"
                            value={summary.data.failedImports}
                            subText={`${summary.data.partialImports} partial`}
                        />
                        <StatCard
                            label="Success rate"
                            value={summary.data.successRate === null ? '—' : `${summary.data.successRate}%`}
                            subText={`${summary.data.failedRows} failed rows`}
                        />
                    </>
                )}
            </div>

            {summary.error && <ErrorState title="Could not load the summary" error={summary.error} onRetry={summary.retry} />}

            <div className="hub-grid">
                {types.loading && <LoadingSkeleton variant="table" rows={5} />}

                {types.error && <ErrorState title="Could not load import types" error={types.error} onRetry={types.retry} />}

                {types.data && (
                    <UploadImportPanel
                        types={types.data.types}
                        onUploaded={handleUploaded}
                        onViewDetails={setViewingId}
                    />
                )}

                <section className="card card--flush panel">
                    <div className="panel__header hub-history__header">
                        <div>
                            <h3 className="panel__title">Import history</h3>
                            <p className="panel__hint">Recent imports and their results</p>
                        </div>
                        <div className="hub-history__filters">
                            <select
                                className="select"
                                aria-label="Filter by type"
                                value={type}
                                onChange={event => updateParams({ type: event.target.value, page: undefined })}
                            >
                                <option value="">All types</option>
                                {(types.data?.types ?? []).map(item => (
                                    <option key={item.key} value={item.key}>{item.label}</option>
                                ))}
                            </select>
                            <select
                                className="select"
                                aria-label="Filter by status"
                                value={status}
                                onChange={event => updateParams({ status: event.target.value, page: undefined })}
                            >
                                <option value="">All statuses</option>
                                {IMPORT_STATUSES.map(item => (
                                    <option key={item} value={item}>{item}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {list.loading && <p className="card__empty muted">Loading imports…</p>}

                    {list.error && (
                        <div className="card__empty">
                            <ErrorState title="Could not load imports" error={list.error} onRetry={list.retry} />
                        </div>
                    )}

                    {list.data && (list.data.imports.length ? (
                        <>
                            <ImportHistoryTable imports={list.data.imports} typeLabels={typeLabels} onView={setViewingId} />
                            <Pagination
                                {...list.data.pagination}
                                onPageChange={next => updateParams({ page: next > 1 ? next : undefined })}
                            />
                        </>
                    ) : (
                        <div className="card__empty">
                            <EmptyState message={type || status ? 'No imports match these filters.' : 'No imports yet. Upload a CSV to get started.'} />
                        </div>
                    ))}
                </section>
            </div>

            {viewingId && (
                <ImportDetailsPanel importId={viewingId} types={types.data?.types ?? []} onClose={() => setViewingId(null)} />
            )}
        </>
    );
}
