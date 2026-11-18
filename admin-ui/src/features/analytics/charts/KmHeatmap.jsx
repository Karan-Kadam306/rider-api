import { useState } from 'react';

import { formatMetric } from '../formatMetric';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LEVELS = 5;

const dayFormatter = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

// Km per day, one row per week: a darker cell means more km. Days without any upload stay empty.
export default function KmHeatmap({ weeks }) {
    const [hovered, setHovered] = useState(null);
    const max = Math.max(...weeks.flatMap(week => week.days.map(day => day.km ?? 0)), 1);
    const level = km => (km ? Math.max(1, Math.ceil((km / max) * LEVELS)) : 0);

    return (
        <div className="heatmap">
            <div className="heatmap__grid" onMouseLeave={() => setHovered(null)}>
                <span />
                {WEEKDAYS.map(day => (
                    <span key={day} className="heatmap__axis">{day}</span>
                ))}

                {weeks.map(week => (
                    <div key={week.weekStart} className="heatmap__row">
                        <span className="heatmap__axis heatmap__axis--row">{week.label}</span>
                        {week.days.map(day => (
                            <button
                                key={day.date}
                                type="button"
                                className={`heatmap__cell heatmap__cell--${day.km === null ? 'empty' : level(day.km)}`}
                                aria-label={`${dayFormatter.format(new Date(`${day.date}T00:00:00.000Z`))}: ${day.km === null ? 'no upload' : formatMetric(day.km, 'km')}`}
                                onMouseEnter={() => setHovered(day)}
                                onFocus={() => setHovered(day)}
                            />
                        ))}
                    </div>
                ))}
            </div>

            <div className="heatmap__footer">
                <span className="heatmap__readout" role="status">
                    {hovered
                        ? `${dayFormatter.format(new Date(`${hovered.date}T00:00:00.000Z`))}: ${hovered.km === null ? 'no upload' : formatMetric(hovered.km, 'km')}`
                        : 'Hover a day to see its km'}
                </span>
                <span className="heatmap__scale">
                    Less
                    {Array.from({ length: LEVELS }, (_, index) => (
                        <span key={index} className={`heatmap__cell heatmap__cell--${index + 1}`} />
                    ))}
                    More
                </span>
            </div>
        </div>
    );
}
