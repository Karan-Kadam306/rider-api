import Icon from './Icon';

// Tile-style tabs for filtering a list by status.
// tabs: [{ value, label, icon, count? }] — count is hidden while undefined (e.g. still loading).
export default function StatusTabs({ tabs, value, onChange, label = 'Status' }) {
    return (
        <div className="status-tabs" role="tablist" aria-label={label}>
            {tabs.map(tab => (
                <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={value === tab.value}
                    className={`status-tab${value === tab.value ? ' status-tab--active' : ''}`}
                    onClick={() => onChange(tab.value)}
                >
                    <Icon name={tab.icon} size={20} />
                    <span>{tab.label}</span>
                    {tab.count !== undefined && <span className="status-tab__count">{tab.count}</span>}
                </button>
            ))}
        </div>
    );
}
