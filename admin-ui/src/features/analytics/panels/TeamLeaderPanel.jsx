import EmptyState from '../../../components/feedback/EmptyState';
import ErrorState from '../../../components/feedback/ErrorState';
import CurrencyText from '../../../components/ui/CurrencyText';

// What each team leader did in the range. Recovered counts charges and Payment Due marked Paid while
// they held the rider; owing now is about the riders they hold today.
// teamLeaders is the list, or { error } when only this request failed.
export default function TeamLeaderPanel({ teamLeaders }) {
    return (
        <section className="card panel analytics__wide">
            <div className="panel__header">
                <h3 className="panel__title">Team leaders</h3>
                <span className="panel__meta">Calls and collections in the range · owing as of today</span>
            </div>

            {teamLeaders.error ? (
                <ErrorState title="Could not load team leader figures" error={teamLeaders.error} />
            ) : teamLeaders.length === 0 ? (
                <EmptyState message="No active team leaders. Add one on the Users page." />
            ) : (
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Team leader</th>
                                <th className="num">Riders</th>
                                <th className="num">Calls</th>
                                <th className="num">Promises kept / broken</th>
                                <th className="num">Dues recovered</th>
                                <th className="num">Owing now</th>
                            </tr>
                        </thead>
                        <tbody>
                            {teamLeaders.map(leader => (
                                <tr key={leader.userId}>
                                    <td>{leader.name}</td>
                                    <td className="num">{leader.riders}</td>
                                    <td className="num">
                                        {leader.calls}
                                        <span className="person__sub">{leader.ridersCalled} riders</span>
                                    </td>
                                    <td className="num">
                                        {leader.promises.kept} / {leader.promises.broken}
                                        <span className="person__sub">of {leader.promises.made} made</span>
                                    </td>
                                    <td className="num">
                                        <CurrencyText value={leader.recovered.amount} />
                                        <span className="person__sub">{leader.recovered.count} paid</span>
                                    </td>
                                    <td className="num">
                                        <CurrencyText value={leader.owingNow.amount} />
                                        <span className="person__sub">{leader.owingNow.count} riders</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
