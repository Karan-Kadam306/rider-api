import EmptyState from '../../../components/feedback/EmptyState';

export default function RidersNeedingReviewTable({ rows }) {
    return (
        <section className="card panel">
            <h3 className="panel__title">Riders needing review</h3>

            {rows.length === 0 ? (
                <EmptyState message="Every rider's bill can be calculated." />
            ) : (
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Rider</th>
                                <th>Reason</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => (
                                <tr key={row.riderId}>
                                    <td>{row.riderId}</td>
                                    <td>{row.reason}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
