import { formatINR } from '../../utils/formatCurrency';
import { formatDateTime } from '../../utils/week';
import { EVENT_LABELS, PAYMENT_LABELS, REVIEW_ITEMS } from './reviewLabels';

const ITEM_LABELS = Object.fromEntries(REVIEW_ITEMS.map(({ item, label }) => [item, label]));
// Payment events whose label does not already say what was paid for.
const GENERIC_PAYMENT_EVENTS = ['payment_started', 'payment_failed', 'extra_payment'];

// Everything that happened to an application, oldest first.
// Shown on the review page and on the rider page's Onboarding tab.
export default function TimelinePanel({ timeline }) {
    return (
        <section className="card panel">
            <div className="panel__header">
                <h3 className="panel__title">Timeline</h3>
            </div>
            <ol className="review-timeline">
                {timeline.map((event, index) => (
                    <li key={index}>
                        <div>
                            {EVENT_LABELS[event.event] ?? event.event}
                            {event.data?.item && ` · ${ITEM_LABELS[event.data.item] ?? event.data.item}`}
                            {event.data?.riderId && ` · ${event.data.riderId}`}
                            {GENERIC_PAYMENT_EVENTS.includes(event.event) && ` · ${PAYMENT_LABELS[event.data.purpose]}`}
                            {event.data?.amount != null && ` · ${formatINR(event.data.amount)}`}
                            {event.data?.reference && ` · ref ${event.data.reference}`}
                        </div>
                        <div className="cell-sub">
                            {event.by === 'rider' ? 'Rider' : event.by === 'system' ? 'System' : event.by} · {formatDateTime(event.at)}
                        </div>
                        {event.note && <div className="cell-sub">“{event.note}”</div>}
                    </li>
                ))}
            </ol>
        </section>
    );
}
