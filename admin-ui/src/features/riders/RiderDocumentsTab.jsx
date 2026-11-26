import { useState } from 'react';

import { getApplication } from '../../api/onboardingApi';
import { useApi } from '../../hooks/useApi';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import LoadingSkeleton from '../../components/feedback/LoadingSkeleton';
import Icon from '../../components/ui/Icon';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatDate } from '../../utils/formatDate';
import { addDays, formatDateTime, todayInIst } from '../../utils/week';
import { REVIEW_ITEMS } from '../onboarding/reviewLabels';
import DocumentViewer from '../onboarding/DocumentViewer';
import { NO_APPLICATION_MESSAGE } from './RiderOnboardingTab';

// A DL this close to expiry gets a warning badge.
const EXPIRY_WARNING_DAYS = 30;

// Dates are YYYY-MM-DD strings, so they compare as text.
function ExpiryBadge({ expiryDate }) {
    const today = todayInIst();

    if (expiryDate < today) {
        return <span className="badge badge--danger">Expired</span>;
    }

    if (expiryDate <= addDays(today, EXPIRY_WARNING_DAYS)) {
        return <span className="badge badge--warning">Expires soon</span>;
    }

    return null;
}

function itemDetails(application, item) {
    if (item === 'bank') {
        const { bank } = application;

        return bank && (
            <>
                A/c ••{bank.accountLast4} · {bank.ifsc} · {bank.holderName}
                {bank.nameAtBank && <> · bank says {bank.nameAtBank}</>}
            </>
        );
    }

    const document = application.documents[item];

    if (!document) {
        return null;
    }

    const parts = [
        document.numberLast4 && `••${document.numberLast4}`,
        document.expiryDate && `valid till ${formatDate(document.expiryDate)}`,
        document.version > 1 && `upload ${document.version}`
    ].filter(Boolean);

    return (
        <>
            {parts.join(' · ')}
            {document.expiryDate && <> <ExpiryBadge expiryDate={document.expiryDate} /></>}
        </>
    );
}

// The documents and bank account the rider sent from the app, as verified at approval.
// Read-only: changes after approval come from the app through Re-approve. Every file opened is logged.
export default function RiderDocumentsTab({ application: link, reloadKey }) {
    const [viewing, setViewing] = useState(null);
    const query = useApi(
        options => (link ? getApplication(link.applicationId, options) : Promise.resolve(null)),
        [link?.applicationId, reloadKey]
    );

    if (!link) {
        return (
            <section className="card">
                <EmptyState message={NO_APPLICATION_MESSAGE} />
            </section>
        );
    }

    if (query.loading) {
        return <LoadingSkeleton variant="table" rows={6} />;
    }

    if (query.error) {
        return <ErrorState title="Could not load the documents" error={query.error} onRetry={query.retry} />;
    }

    const application = query.data;

    return (
        <section className="card panel">
            <div className="panel__header">
                <h3 className="panel__title">Documents</h3>
                <span className="panel__meta">Numbers are masked; opening a file is logged</span>
            </div>
            <ul className="review-checklist">
                {REVIEW_ITEMS.map(({ item, label }) => {
                    const reviewed = item === 'bank' ? application.bank : application.documents[item];
                    const files = application.documents[item]?.files ?? [];

                    return (
                        <li key={item} className="review-checklist__item">
                            <div>
                                <div className="person__name">
                                    {label} {reviewed && <StatusBadge status={reviewed.reviewStatus} />}
                                </div>
                                <div className="cell-sub mono">{itemDetails(application, item) ?? 'Not uploaded'}</div>
                                {reviewed?.reviewedBy && (
                                    <div className="cell-sub">{reviewed.reviewedBy} · {formatDateTime(reviewed.reviewedAt)}</div>
                                )}
                            </div>
                            <div className="row-actions">
                                {files.map(file => (
                                    <button
                                        key={file.fileId}
                                        type="button"
                                        className="pill-button"
                                        onClick={() => setViewing({ file, title: label })}
                                    >
                                        <Icon name="file" size={15} />
                                        {file.side === 'single' ? 'View' : file.side}
                                    </button>
                                ))}
                            </div>
                        </li>
                    );
                })}
            </ul>

            {viewing && (
                <DocumentViewer
                    applicationId={application.applicationId}
                    file={viewing.file}
                    title={viewing.title}
                    onClose={() => setViewing(null)}
                />
            )}
        </section>
    );
}
