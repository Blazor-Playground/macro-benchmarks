import { RUNTIME_COLORS } from './constants.js';
import { formatFocusValue, isPositive, signedPercent } from './focus-data.js';
import { DEFAULT_FOCUS_GRAPH_VISIBILITY } from './focus-selection.js';
export const FOCUS_BAND_OPACITY = 0.2;
const SERIES = [
    { key: 'coreclr', label: 'CoreCLR', color: RUNTIME_COLORS.coreclr, axis: 'y' },
    { key: 'mono', label: 'Mono', color: RUNTIME_COLORS.mono, axis: 'y' },
    { key: 'percent', label: 'CoreCLR vs Mono (%)', color: '#7b4bc4', axis: 'comparison' },
];
function windowFor(point, series) {
    if (series === 'coreclr')
        return point.coreclrWindow;
    if (series === 'mono')
        return point.monoWindow;
    return point.percentWindow;
}
function rawValue(point, series) {
    if (series === 'percent')
        return point.percent;
    return isPositive(point[series]) ? point[series] : null;
}
export function focusChartModel(metric, averaged, showBands, visibility = DEFAULT_FOCUS_GRAPH_VISIBILITY) {
    const series = SERIES.filter(config => config.key === 'percent' ? visibility.percentage : visibility.measurements).map(config => ({
        ...config,
        label: config.key === 'coreclr' ? metric.coreclrLabel : config.key === 'mono' ? metric.monoLabel : config.label,
        data: metric.points.map(point => {
            const raw = rawValue(point, config.key);
            const value = averaged ? windowFor(point, config.key)?.mean ?? null : raw;
            return { x: point.position, y: value === null ? null : value / (config.key === 'percent' ? 1 : metric.divisor) };
        }),
        windows: metric.points.map(point => windowFor(point, config.key)),
    }));
    // Keep domains stable across presentation toggles, including lookback-window extrema.
    let runtimeMax = 0;
    let percentMin = 0;
    let percentMax = 0;
    for (const point of metric.points) {
        for (const key of ['coreclr', 'mono']) {
            runtimeMax = Math.max(runtimeMax, rawValue(point, key) ?? 0, windowFor(point, key)?.max ?? 0);
        }
        percentMin = Math.min(percentMin, point.percent ?? 0, point.percentWindow?.min ?? 0);
        percentMax = Math.max(percentMax, point.percent ?? 0, point.percentWindow?.max ?? 0);
    }
    const padding = Math.max((percentMax - percentMin) * 0.1, 5);
    return {
        series, bands: averaged && showBands && series.length > 0, bandOpacity: FOCUS_BAND_OPACITY,
        runtimeMax: Math.max(runtimeMax / metric.divisor * 1.1, 1),
        percentMin: percentMin - padding, percentMax: percentMax + padding,
        xMin: metric.points.length === 1 ? -0.5 : 0,
        xMax: metric.points.length === 1 ? 0.5 : Math.max(metric.points.length - 1, 1),
    };
}
export function drawFocusBand(ctx, points, color) {
    if (points.length < 2)
        return;
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = FOCUS_BAND_OPACITY;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].max);
    for (const point of points.slice(1))
        ctx.lineTo(point.x, point.max);
    for (const point of [...points].reverse())
        ctx.lineTo(point.x, point.min);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.8;
    // Only the fill closes. Separate open boundary paths have no vertical end-cap strokes.
    for (const bound of ['min', 'max']) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0][bound]);
        for (const point of points.slice(1))
            ctx.lineTo(point.x, point[bound]);
        ctx.stroke();
    }
    ctx.restore();
}
export class FocusCharts {
    charts = [];
    dispose() {
        for (const chart of this.charts)
            chart.destroy();
        this.charts.length = 0;
    }
    render(owner, report, averaged, showBands, visibility = DEFAULT_FOCUS_GRAPH_VISIBILITY) {
        this.dispose();
        if (!visibility.percentage && !visibility.measurements)
            return;
        for (const metric of report.metrics) {
            if (!metric.points.some(point => (visibility.percentage && point.percent !== null)
                || (visibility.measurements && (isPositive(point.coreclr) || isPositive(point.mono)))))
                continue;
            const canvas = document.getElementById(`focus-${owner}-${metric.id}`);
            if (!(canvas instanceof HTMLCanvasElement))
                throw new Error(`Focus canvas '${metric.id}' was not rendered.`);
            const context = canvas.getContext('2d');
            if (!context)
                throw new Error(`A canvas context is unavailable for ${metric.title}.`);
            const model = focusChartModel(metric, averaged, showBands, visibility);
            const plugin = {
                id: 'focusEnvelopes',
                beforeDatasetsDraw(chart) {
                    const { ctx, chartArea, scales } = chart;
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
                    ctx.clip();
                    if (model.bands) {
                        for (const series of model.series) {
                            const scale = scales[series.axis];
                            let segment = [];
                            const paint = () => { drawFocusBand(ctx, segment, series.color); segment = []; };
                            series.windows.forEach((window, index) => {
                                if (!window) {
                                    paint();
                                    return;
                                }
                                const divisor = series.key === 'percent' ? 1 : metric.divisor;
                                segment.push({
                                    x: scales.x.getPixelForValue(metric.points[index].position),
                                    min: scale.getPixelForValue(window.min / divisor),
                                    max: scale.getPixelForValue(window.max / divisor),
                                });
                            });
                            paint();
                        }
                    }
                    if (visibility.percentage) {
                        const parity = scales.comparison.getPixelForValue(0);
                        ctx.strokeStyle = '#a99abc';
                        ctx.lineWidth = 1;
                        ctx.setLineDash([3, 4]);
                        ctx.beginPath();
                        ctx.moveTo(chartArea.left, parity);
                        ctx.lineTo(chartArea.right, parity);
                        ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.fillStyle = '#765293';
                        ctx.font = '9px sans-serif';
                        ctx.fillText('0% parity', chartArea.left + 4, parity - 4);
                    }
                    ctx.restore();
                },
            };
            const config = {
                type: 'line',
                data: { datasets: model.series.map(series => ({
                        label: series.label, data: series.data, yAxisID: series.axis,
                        borderColor: series.color, backgroundColor: series.color,
                        borderDash: series.key === 'percent' ? [5, 4] : [],
                        borderWidth: 2, pointRadius: metric.points.length === 1 ? 3 : 1.4,
                        pointHoverRadius: 4, tension: 0, spanGaps: false, fill: false,
                    })) },
                plugins: [plugin],
                options: {
                    responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                title(items) {
                                    const point = metric.points[items[0]?.dataIndex];
                                    return point ? `${point.observation.sdkVersion}\nSDK day ${point.observation.day} (UTC)` : '';
                                },
                                label(item) {
                                    const series = model.series[item.datasetIndex];
                                    const point = metric.points[item.dataIndex];
                                    const raw = rawValue(point, series.key);
                                    const format = (value) => series.key === 'percent' ? signedPercent(value) : formatFocusValue(value, metric);
                                    const lines = [`${model.series[item.datasetIndex].label} raw: ${raw === null ? 'Not available' : format(raw)}`];
                                    const window = windowFor(point, series.key);
                                    if (averaged && window) {
                                        lines.push(`Mean ${format(window.mean)}; min ${format(window.min)}; max ${format(window.max)}`);
                                        lines.push(`${window.count} of 5 observations: ${window.firstDay} to ${window.lastDay}`);
                                        lines.push(`From SDK ${window.firstSdk}`);
                                    }
                                    return lines;
                                },
                                footer: () => [
                                    `${metric.coreclrLabel} vs ${metric.monoLabel}`,
                                    `${metric.profile === 'mobile' ? 'Mobile (throttled)' : 'Desktop (unthrottled)'} / Chromium`,
                                    'Historical: environment provenance unverified.',
                                ],
                            },
                        },
                    },
                    scales: {
                        x: {
                            type: 'linear', min: model.xMin, max: model.xMax,
                            grid: { display: false },
                            ticks: {
                                stepSize: Math.max(1, Math.ceil((metric.points.length - 1) / 3)),
                                maxRotation: 0, font: { size: 8 },
                                callback(value) {
                                    return metric.points[Number(value)]?.observation.day.slice(5) ?? '';
                                },
                            },
                        },
                        ...(visibility.measurements ? { y: {
                                type: 'linear', position: 'left', min: 0, max: model.runtimeMax,
                                title: { display: true, text: metric.unit, font: { size: 9 } },
                                grid: { color: '#eceef5' },
                                ticks: { maxTicksLimit: 3, font: { size: 8 } },
                            } } : {}),
                        ...(visibility.percentage ? { comparison: {
                                type: 'linear', position: 'right', min: model.percentMin, max: model.percentMax,
                                title: { display: true, text: 'vs Mono %', color: '#765293', font: { size: 9 } },
                                grid: { drawOnChartArea: false },
                                ticks: { maxTicksLimit: 3, font: { size: 8 }, color: '#765293',
                                    callback: (value) => `${value > 0 ? '+' : ''}${Number(value.toFixed(1))}%` },
                            } } : {}),
                    },
                },
            };
            this.charts.push(new Chart(context, config));
        }
    }
}
