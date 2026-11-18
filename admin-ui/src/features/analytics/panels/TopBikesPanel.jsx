import EmptyState from '../../../components/feedback/EmptyState';
import { formatMetric } from '../formatMetric';

// Bikes with the most km in the range, as bars against the busiest one.
export default function TopBikesPanel({ bikes }) {
    const max = bikes[0]?.km || 1;

    return (
        <section className="card panel">
            <div className="panel__header">
                <h3 className="panel__title">Most used bikes</h3>
                <span className="panel__meta">Km in range · avg per day</span>
            </div>

            {bikes.length === 0 ? (
                <EmptyState message="No km uploaded in this range." />
            ) : (
                <ul className="hbars">
                    {bikes.map(bike => (
                        <li key={bike.bike} className="hbars__row">
                            <span className="hbars__label mono" title={bike.bike}>{bike.bike}</span>
                            <span className="hbars__track">
                                <span className="hbars__bar" style={{ width: `${(bike.km / max) * 100}%` }} />
                            </span>
                            <span className="hbars__value">
                                {formatMetric(Math.round(bike.km), 'km')}
                                <small>{formatMetric(Math.round(bike.avgKm), 'km')}/day</small>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
