import SegmentedBar from '../charts/SegmentedBar';

// Today's fleet and rider base by status.
export default function FleetPanel({ bikes, riders }) {
    return (
        <section className="card panel">
            <div className="panel__header">
                <h3 className="panel__title">Fleet and riders today</h3>
            </div>
            <SegmentedBar
                label="Bikes"
                total={bikes.total}
                parts={['Assigned', 'Available', 'Maintenance'].map(status => ({ label: status, value: bikes[status] }))}
            />
            <SegmentedBar
                label="Riders"
                total={riders.total}
                parts={['Active', 'Inactive', 'Terminated'].map(status => ({ label: status, value: riders[status] }))}
            />
        </section>
    );
}
