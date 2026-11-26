import StatusBadge from '../../components/ui/StatusBadge';

// Results of the checks run at submit. They only flag things; the reviewer decides.
// Shown on the review page and on the rider page's Onboarding tab.
export default function ChecksPanel({ application, name }) {
    const { checks, bank } = application;
    const matches = checks.duplicate?.details.matches ?? [];

    return (
        <section className="card panel">
            <div className="panel__header">
                <h3 className="panel__title">Checks</h3>
                <span className="panel__meta">Flags only; you decide</span>
            </div>
            <dl className="detail-list">
                <div>
                    <dt>Duplicates</dt>
                    <dd>
                        {checks.duplicate ? <StatusBadge status={checks.duplicate.status} /> : 'Not run'}
                        {matches.map(match => (
                            <div key={`${match.field}-${match.applicationNo}`} className="cell-sub">
                                Same {match.field} as {match.applicationNo} ({match.applicationStatus})
                                {match.riderId && `, rider ${match.riderId} (${match.riderStatus})`}
                            </div>
                        ))}
                    </dd>
                </div>
                <div>
                    <dt>Bank name</dt>
                    <dd>
                        {checks.bank ? <StatusBadge status={checks.bank.status} /> : 'Not run'}
                        {bank && (
                            <div className="cell-sub">
                                Applicant: <strong>{name}</strong> · Bank says: <strong>{bank.nameAtBank ?? '—'}</strong>
                            </div>
                        )}
                    </dd>
                </div>
                {['pan', 'dl'].map(kind => (
                    <div key={kind}>
                        <dt>{kind === 'pan' ? 'PAN lookup' : 'Licence lookup'}</dt>
                        <dd>
                            {checks[kind] ? <StatusBadge status={checks[kind].status} /> : 'Not run'}
                            {checks[kind]?.details.error && <div className="cell-sub">{checks[kind].details.error}</div>}
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
