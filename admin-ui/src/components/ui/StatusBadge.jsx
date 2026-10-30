import { getStatusTone } from '../../utils/statusColors';

export default function StatusBadge({ status }) {
    return <span className={`badge badge--${getStatusTone(status)}`}>{status}</span>;
}
