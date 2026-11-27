import { Link, useNavigate } from 'react-router-dom';

import Icon from '../../components/ui/Icon';
import StatusBadge from '../../components/ui/StatusBadge';
import CurrencyText from '../../components/ui/CurrencyText';
import { formatDate, formatRelativeTime } from '../../utils/formatDate';

// Short names for the list; the review page uses the full ones.
const DUE_LABELS = { Deposit: 'Deposit', PrepaidPack: 'pack' };

// Applications for one onboarding tab. A row (or Review) opens the review page, where every
// decision is made with the documents in view. The Payment tab also shows what is due and how the
// rider's last payment attempt went.
export default function ApplicationsTable({ applications, tab }) {
    const navigate = useNavigate();
    const showPayment = tab === 'payment';
    const reviewPath = application => `/onboarding/${application.applicationId}`;

    return (
        <div className="table-wrap">
            <table className="table table--roomy table--clickable">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Phone</th>
                        {/* Approved riders have a rider code; search still finds the application number. */}
                        {!showPayment && <th>Application</th>}
                        <th>Rider code</th>
                        <th>Hub</th>
                        <th>Plan</th>
                        <th>Status</th>
                        {showPayment ? (
                            <>
                                <th>Due</th>
                                <th>Last attempt</th>
                            </>
                        ) : (
                            <th>Submitted</th>
                        )}
                        <th className="actions-col">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {applications.map(application => (
                        <tr key={application.applicationId} onClick={() => navigate(reviewPath(application))}>
                            <td>
                                <span className="person__name">{application.name}</span>
                                {application.isTest && <> <span className="badge badge--warning">Test</span></>}
                            </td>
                            <td className="mono">{application.phone}</td>
                            {!showPayment && <td className="mono">{application.applicationNo}</td>}
                            <td className="mono">{application.riderId ?? <span className="muted">Pending</span>}</td>
                            <td>{application.hubName ?? <span className="muted">—</span>}</td>
                            <td>{application.planType ?? <span className="muted">—</span>}</td>
                            <td><StatusBadge status={application.status} /></td>
                            {showPayment ? (
                                <PaymentCells payment={application.payment} />
                            ) : (
                                <td className="muted">{application.submittedAt ? formatDate(application.submittedAt) : 'Not yet'}</td>
                            )}
                            {/* Clicks on the button must not also open the row. */}
                            <td className="actions-col" onClick={event => event.stopPropagation()}>
                                <Link to={reviewPath(application)} className="pill-button">
                                    <Icon name="eye" size={15} />
                                    Review
                                </Link>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// What is still due at today's prices, and the newest payment attempt.
function PaymentCells({ payment }) {
    if (!payment) {
        return (
            <>
                <td className="muted">—</td>
                <td className="muted">—</td>
            </>
        );
    }

    const { due, amountDue, lastAttempt } = payment;

    return (
        <>
            <td>
                <CurrencyText value={amountDue} />
                <div className="cell-sub">{due.map(purpose => DUE_LABELS[purpose]).join(' + ')}</div>
            </td>
            <td>
                {lastAttempt ? (
                    // The failure reason is on the review page, and in the tooltip here.
                    <span title={lastAttempt.failureReason ?? undefined}>
                        <StatusBadge status={lastAttempt.status} />
                        <div className="cell-sub">{formatRelativeTime(lastAttempt.at)}</div>
                    </span>
                ) : (
                    <span className="muted">Not started</span>
                )}
            </td>
        </>
    );
}
