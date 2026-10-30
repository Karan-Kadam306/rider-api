import Icon from '../../components/ui/Icon';

export const RIDER_STATUSES = [
    { status: 'Active', icon: 'userCheck' },
    { status: 'Inactive', icon: 'userPause' },
    { status: 'Terminated', icon: 'userX' }
];

// One tile per rider status, with its count from /api/riders/summary.
export default function RiderStatusTabs({ value, counts, onChange }) {
    return (
        <div className="status-tabs" role="tablist" aria-label="Rider status">
            {RIDER_STATUSES.map(({ status, icon }) => (
                <button
                    key={status}
                    type="button"
                    role="tab"
                    aria-selected={value === status}
                    className={`status-tab${value === status ? ' status-tab--active' : ''}`}
                    onClick={() => onChange(status)}
                >
                    <Icon name={icon} size={20} />
                    <span>{status}</span>
                    {counts && <span className="status-tab__count">{counts[status]}</span>}
                </button>
            ))}
        </div>
    );
}
