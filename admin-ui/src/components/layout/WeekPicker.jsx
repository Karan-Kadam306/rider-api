import { useWeek } from '../../context/WeekContext';
import { addDays, currentWeekStart, formatWeekRange } from '../../utils/week';

// Chooses the billing week; any picked date snaps to its Monday.
export default function WeekPicker() {
    const { weekStart, setWeekStart } = useWeek();
    const thisWeek = currentWeekStart();
    const isCurrentWeek = weekStart >= thisWeek;

    return (
        <div className="week-picker">
            <button
                type="button"
                className="button button--icon"
                aria-label="Previous week"
                onClick={() => setWeekStart(addDays(weekStart, -7))}
            >
                ‹
            </button>

            <label className="week-picker__label">
                <span className="week-picker__range">{formatWeekRange(weekStart)}</span>
                <input
                    type="date"
                    className="week-picker__input"
                    value={weekStart}
                    max={thisWeek}
                    aria-label="Pick any day in the billing week"
                    onChange={event => event.target.value && setWeekStart(event.target.value)}
                />
            </label>

            <button
                type="button"
                className="button button--icon"
                aria-label="Next week"
                disabled={isCurrentWeek}
                onClick={() => setWeekStart(addDays(weekStart, 7))}
            >
                ›
            </button>

            {!isCurrentWeek && (
                <button type="button" className="button button--link" onClick={() => setWeekStart(thisWeek)}>
                    This week
                </button>
            )}
        </div>
    );
}
