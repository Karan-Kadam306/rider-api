import { getStatusTone } from '../../utils/statusColors';

// Coloured pill for a status; the colour comes from statusColors.
export default function StatusBadge({ status }) {
    return <span className={`badge badge--${getStatusTone(status)}`}>{status}</span>;
}
