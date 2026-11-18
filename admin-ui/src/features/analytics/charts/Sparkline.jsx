import { useChartWidth } from './useChartWidth';

const HEIGHT = 34;
const PAD = 5;

// Small trend line for a stat tile: muted line, the latest week as an accent dot. Decorative,
// the tile already states the value and change.
export default function Sparkline({ values }) {
    const [ref, width] = useChartWidth(160);
    const points = values.map(value => value ?? 0);

    if (points.length < 2) {
        return <div ref={ref} className="sparkline" />;
    }

    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const x = index => PAD + (index / (points.length - 1)) * (width - PAD * 2);
    const y = value => HEIGHT - PAD - ((value - min) / span) * (HEIGHT - PAD * 2);
    const path = points.map((value, index) => `${index ? 'L' : 'M'}${x(index)},${y(value)}`).join(' ');

    return (
        <div ref={ref} className="sparkline">
            <svg width={width} height={HEIGHT} aria-hidden="true">
                <path d={path} className="sparkline__line" />
                <circle cx={x(points.length - 1)} cy={y(points.at(-1))} r="4" className="sparkline__dot" />
            </svg>
        </div>
    );
}
