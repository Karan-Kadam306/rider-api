export default function EmptyState({ message = 'No data for this week' }) {
    return <p className="state state--empty">{message}</p>;
}
