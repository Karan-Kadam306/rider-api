// Small stroke icon set (24×24 grid), drawn inline so no icon library is needed.
const PATHS = {
    dashboard: (
        <>
            <rect x="3" y="3" width="7" height="9" rx="1" />
            <rect x="14" y="3" width="7" height="5" rx="1" />
            <rect x="14" y="12" width="7" height="9" rx="1" />
            <rect x="3" y="16" width="7" height="5" rx="1" />
        </>
    ),
    users: (
        <>
            <circle cx="9" cy="8" r="4" />
            <path d="M2 21v-1a6 6 0 0 1 12 0v1" />
            <path d="M16 3.5a4 4 0 0 1 0 9" />
            <path d="M22 21v-1a6 6 0 0 0-4-5.7" />
        </>
    ),
    bike: (
        <>
            <circle cx="5.5" cy="17.5" r="3.5" />
            <circle cx="18.5" cy="17.5" r="3.5" />
            <path d="M15 6h2l3 11.5" />
            <path d="M5.5 17.5 9 10h7l-4 7.5H5.5" />
        </>
    ),
    gauge: (
        <>
            <path d="M12 14 16 10" />
            <path d="M3.3 19a10 10 0 1 1 17.4 0" />
        </>
    ),
    rupee: (
        <>
            <path d="M6 3h12" />
            <path d="M6 8h12" />
            <path d="M6 13l8.5 8" />
            <path d="M6 13h3a5 5 0 0 0 0-10" />
        </>
    ),
    search: (
        <>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
        </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    edit: (
        <>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </>
    ),
    userCheck: (
        <>
            <circle cx="9" cy="8" r="4" />
            <path d="M2 21v-1a6 6 0 0 1 12 0v1" />
            <path d="m16 11 2 2 4-4" />
        </>
    ),
    userPause: (
        <>
            <circle cx="9" cy="8" r="4" />
            <path d="M2 21v-1a6 6 0 0 1 12 0v1" />
            <path d="M18 9v5M21 9v5" />
        </>
    ),
    userX: (
        <>
            <circle cx="9" cy="8" r="4" />
            <path d="M2 21v-1a6 6 0 0 1 12 0v1" />
            <path d="m17 8 5 5M22 8l-5 5" />
        </>
    ),
    home: (
        <>
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
        </>
    ),
    chevronRight: <path d="m9 6 6 6-6 6" />,
    chevronLeft: <path d="m15 6-6 6 6 6" />,
    refresh: (
        <>
            <path d="M20 11a8 8 0 0 0-14.8-4M4 4v4h4" />
            <path d="M4 13a8 8 0 0 0 14.8 4M20 20v-4h-4" />
        </>
    )
};

export default function Icon({ name, size = 18, className }) {
    return (
        <svg
            className={className}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {PATHS[name]}
        </svg>
    );
}
