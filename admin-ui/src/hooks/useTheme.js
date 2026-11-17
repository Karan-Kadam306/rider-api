import { useEffect, useState } from 'react';

// Same key as the script in index.html, which applies the theme before the first paint.
const STORAGE_KEY = 'rider-admin-theme';

// Storage can be blocked (private windows, strict settings); the theme still works for this visit.
function getSavedTheme() {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

function saveTheme(theme) {
    try {
        localStorage.setItem(STORAGE_KEY, theme);
    } catch {
        // Not saved; the next visit falls back to the system setting.
    }
}

// Starts from what index.html already applied, so the button matches the page on load.
function getCurrentTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

// Light (Frosted Day) or dark (Night Shift). Only changes colours; no data or API is involved.
export function useTheme() {
    const [theme, setTheme] = useState(getCurrentTheme);

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
    }, [theme]);

    // Until someone picks a theme, follow the system setting when it changes.
    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: dark)');

        function handleChange(event) {
            if (!getSavedTheme()) {
                setTheme(event.matches ? 'dark' : 'light');
            }
        }

        media.addEventListener('change', handleChange);
        return () => media.removeEventListener('change', handleChange);
    }, []);

    function toggleTheme() {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        saveTheme(next);
    }

    return { theme, toggleTheme };
}
