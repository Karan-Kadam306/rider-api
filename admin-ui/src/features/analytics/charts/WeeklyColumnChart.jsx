import { useState } from 'react';

import { formatCompact, formatMetric } from '../formatMetric';
import { useChartWidth } from './useChartWidth';

const HEIGHT = 240;
const MARGIN = { top: 12, right: 12, bottom: 28, left: 56 };
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;
const TICK_COUNT = 4;
const LABEL_WIDTH = 52;

// Round step (1, 2 or 5 × 10ⁿ) so axis ticks land on clean numbers.
function niceStep(range) {
    const raw = range / TICK_COUNT || 1;
    const power = 10 ** Math.floor(Math.log10(raw));
    const fraction = raw / power;
    const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
    return nice * power;
}

function getTicks(min, max) {
    const step = niceStep(max - min);
    const ticks = [];

    for (let tick = Math.floor(min / step) * step; tick <= Math.ceil(max / step) * step + step / 2; tick += step) {
        ticks.push(Math.round(tick * 100) / 100);
    }

    return ticks;
}

// Bar from the baseline to the value: square at the baseline, 4px rounded at the data end.
function barPath(x, yBase, yValue, width) {
    const direction = yValue <= yBase ? 1 : -1;
    const r = Math.min(RADIUS, Math.abs(yBase - yValue), width / 2);

    return [
        `M${x},${yBase}`,
        `L${x},${yValue + direction * r}`,
        `Q${x},${yValue} ${x + r},${yValue}`,
        `L${x + width - r},${yValue}`,
        `Q${x + width},${yValue} ${x + width},${yValue + direction * r}`,
        `L${x + width},${yBase}`,
        'Z'
    ].join(' ');
}

// Weekly columns, grouped or stacked, with an optional line on the same scale.
// series and line: { key, label, color, values }. faded marks weeks that are not closed yet.
export default function WeeklyColumnChart({ labels, series, line, stacked = false, format, faded = [], label }) {
    const [ref, width] = useChartWidth();
    const [hovered, setHovered] = useState(null);

    const plotWidth = width - MARGIN.left - MARGIN.right;
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const band = plotWidth / labels.length;

    const stackTotals = labels.map((_, index) => series.reduce((total, item) => total + item.values[index], 0));
    const allValues = [
        ...(stacked ? stackTotals : series.flatMap(item => item.values)),
        ...(line ? line.values : []),
        0
    ];
    const ticks = getTicks(Math.min(...allValues), Math.max(...allValues));
    const yMin = ticks[0];
    const yMax = ticks.at(-1);
    const y = value => MARGIN.top + plotHeight - ((value - yMin) / (yMax - yMin || 1)) * plotHeight;
    const center = index => MARGIN.left + band * index + band / 2;

    const barWidth = stacked
        ? Math.min(MAX_BAR * 1.5, band * 0.6)
        : Math.min(MAX_BAR, (band * 0.72 - GAP * (series.length - 1)) / series.length);
    const groupWidth = stacked ? barWidth : barWidth * series.length + GAP * (series.length - 1);
    // Show every nth week label when they would overlap.
    const labelEvery = Math.max(1, Math.ceil((LABEL_WIDTH * labels.length) / plotWidth));

    const linePath = line?.values.map((value, index) => `${index ? 'L' : 'M'}${center(index)},${y(value)}`).join(' ');

    const tooltipLeft = hovered === null ? 0 : Math.min(Math.max(center(hovered), 90), width - 90);

    return (
        <div className="chart">
            <ul className="chart-legend">
                {series.map(item => (
                    <li key={item.key}>
                        <span className="chart-legend__swatch" style={{ background: item.color }} />
                        {item.label}
                    </li>
                ))}
                {line && (
                    <li>
                        <span className="chart-legend__line" style={{ background: line.color }} />
                        {line.label}
                    </li>
                )}
                {faded.some(Boolean) && <li className="chart-legend__note">Faded: week not closed yet</li>}
            </ul>

            <div ref={ref} className="chart__plot" onMouseLeave={() => setHovered(null)}>
                <svg width={width} height={HEIGHT} role="img" aria-label={label}>
                    {ticks.map(tick => (
                        <g key={tick}>
                            <line
                                x1={MARGIN.left}
                                x2={width - MARGIN.right}
                                y1={y(tick)}
                                y2={y(tick)}
                                className={tick === 0 ? 'chart__baseline' : 'chart__grid'}
                            />
                            <text x={MARGIN.left - 8} y={y(tick)} className="chart__tick" textAnchor="end" dominantBaseline="middle">
                                {formatCompact(tick, format)}
                            </text>
                        </g>
                    ))}

                    {hovered !== null && (
                        <rect
                            x={MARGIN.left + band * hovered}
                            y={MARGIN.top}
                            width={band}
                            height={plotHeight}
                            className="chart__hover-band"
                        />
                    )}

                    {labels.map((weekLabel, index) => {
                        const start = center(index) - groupWidth / 2;
                        let stackTop = y(0);

                        return (
                            <g key={weekLabel} opacity={faded[index] ? 0.45 : 1}>
                                {series.map((item, seriesIndex) => {
                                    const value = item.values[index];

                                    if (!value) {
                                        return null;
                                    }

                                    if (stacked) {
                                        // Segments after the first start 2px higher, leaving a surface gap.
                                        const base = seriesIndex === 0 ? stackTop : stackTop - GAP;
                                        const top = base - (y(0) - y(value));
                                        const isLast = series.slice(seriesIndex + 1).every(next => !next.values[index]);
                                        stackTop = top;

                                        return (
                                            <path
                                                key={item.key}
                                                d={isLast ? barPath(start, base, top, barWidth) : `M${start},${base} H${start + barWidth} V${top} H${start} Z`}
                                                fill={item.color}
                                            />
                                        );
                                    }

                                    return (
                                        <path
                                            key={item.key}
                                            d={barPath(start + seriesIndex * (barWidth + GAP), y(0), y(value), barWidth)}
                                            fill={item.color}
                                        />
                                    );
                                })}
                            </g>
                        );
                    })}

                    {line && (
                        <g>
                            <path d={linePath} className="chart__line" stroke={line.color} />
                            {line.values.map((value, index) => (
                                <circle
                                    key={labels[index]}
                                    cx={center(index)}
                                    cy={y(value)}
                                    r="4"
                                    fill={line.color}
                                    className="chart__dot"
                                    opacity={faded[index] ? 0.6 : 1}
                                />
                            ))}
                        </g>
                    )}

                    {labels.map((weekLabel, index) => (
                        index % labelEvery === (labels.length - 1) % labelEvery && (
                            <text key={weekLabel} x={center(index)} y={HEIGHT - 8} className="chart__tick" textAnchor="middle">
                                {weekLabel}
                            </text>
                        )
                    ))}

                    {/* Hit areas cover the whole week, much bigger than the bars, and take keyboard focus. */}
                    {labels.map((weekLabel, index) => (
                        <rect
                            key={weekLabel}
                            x={MARGIN.left + band * index}
                            y={MARGIN.top}
                            width={band}
                            height={plotHeight}
                            className="chart__hit"
                            tabIndex={0}
                            aria-label={`Week of ${weekLabel}`}
                            onMouseEnter={() => setHovered(index)}
                            onFocus={() => setHovered(index)}
                            onBlur={() => setHovered(null)}
                        />
                    ))}
                </svg>

                {hovered !== null && (
                    <div className="chart-tooltip" style={{ left: tooltipLeft }} role="status">
                        <div className="chart-tooltip__title">
                            Week of {labels[hovered]}
                            {faded[hovered] && <span className="chart-tooltip__tag">open</span>}
                        </div>
                        {[...series, ...(line ? [line] : [])].map(item => (
                            <div key={item.key} className="chart-tooltip__row">
                                <span className="chart-legend__swatch" style={{ background: item.color }} />
                                <span>{item.label}</span>
                                <strong>{formatMetric(item.values[hovered], format)}</strong>
                            </div>
                        ))}
                        {stacked && (
                            <div className="chart-tooltip__row chart-tooltip__row--total">
                                <span />
                                <span>Total</span>
                                <strong>{formatMetric(stackTotals[hovered], format)}</strong>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
