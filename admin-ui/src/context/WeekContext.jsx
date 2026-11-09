import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { currentWeekStart, toMonday } from '../utils/week';

const WeekContext = createContext(null);

// Selected billing week plus a refresh trigger, shared by every page.
export function WeekProvider({ children }) {
    const [weekStart, setWeekStartState] = useState(currentWeekStart);
    const [refreshKey, setRefreshKey] = useState(0);

    // Any date snaps to its Monday, so the API never sees an invalid week.
    const setWeekStart = useCallback(date => setWeekStartState(toMonday(date)), []);
    // Pages list refreshKey in their useApi deps, so bumping it refetches whatever is on screen.
    const refresh = useCallback(() => setRefreshKey(key => key + 1), []);

    const value = useMemo(
        () => ({ weekStart, setWeekStart, refreshKey, refresh }),
        [weekStart, setWeekStart, refreshKey, refresh]
    );

    return <WeekContext.Provider value={value}>{children}</WeekContext.Provider>;
}

// Returns { weekStart, setWeekStart, refreshKey, refresh }.
export function useWeek() {
    const context = useContext(WeekContext);

    if (!context) {
        throw new Error('useWeek must be used inside WeekProvider');
    }

    return context;
}
