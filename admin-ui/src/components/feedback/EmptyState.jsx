// Message shown in place of a list or table that has nothing to display.
export default function EmptyState({ message = 'No data for this week' }) {
    return <p className="state state--empty">{message}</p>;
}
