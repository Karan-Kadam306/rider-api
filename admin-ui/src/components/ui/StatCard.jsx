import { Link } from 'react-router-dom';

// Base summary card, used on the Dashboard, Billing, Payouts and Document Hub pages.
// children render under subText; to and linkLabel add a link at the bottom.
export default function StatCard({ label, value, subText, badge, to, linkLabel = 'View', children }) {
    return (
        <section className="card stat-card">
            <div className="stat-card__header">
                <h3 className="stat-card__label">{label}</h3>
                {badge}
            </div>
            <div className="stat-card__value">{value}</div>
            {subText && <p className="stat-card__sub">{subText}</p>}
            {children}
            {to && (
                <Link className="stat-card__link" to={to}>
                    {linkLabel} →
                </Link>
            )}
        </section>
    );
}
