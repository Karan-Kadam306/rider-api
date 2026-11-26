import { Link, useNavigate } from 'react-router-dom';

import Icon from '../../components/ui/Icon';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatDate } from '../../utils/formatDate';

// Applications for one onboarding tab. A row (or Review) opens the review page, where every
// decision is made with the documents in view.
export default function ApplicationsTable({ applications }) {
    const navigate = useNavigate();
    const reviewPath = application => `/onboarding/${application.applicationId}`;

    return (
        <div className="table-wrap">
            <table className="table table--roomy table--clickable">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Application</th>
                        <th>Rider code</th>
                        <th>Hub</th>
                        <th>Plan</th>
                        <th>Status</th>
                        <th>Submitted</th>
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
                            <td className="mono">{application.applicationNo}</td>
                            <td className="mono">{application.riderId ?? <span className="muted">Pending</span>}</td>
                            <td>{application.hubName ?? <span className="muted">—</span>}</td>
                            <td>{application.planType ?? <span className="muted">—</span>}</td>
                            <td><StatusBadge status={application.status} /></td>
                            <td className="muted">{application.submittedAt ? formatDate(application.submittedAt) : 'Not yet'}</td>
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
