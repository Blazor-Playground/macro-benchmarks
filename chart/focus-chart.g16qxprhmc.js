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
    if (series === 'coreclrBefore')
        return null;
    if (series === 'coreclr')
        return point.coreclrWindow;
    if (series === 'mono')
        return point.monoWindow;
    return point.percentWindow;
}
function rawValue(point, series) {
    if (series === 'percent')
        return point.percent;
    const value = point[series] ?? null;
    return isPositive(value) ? value : null;
}
function commitRow(label, hash, repository) {
    const value = hash || 'Not recorded';
    return {
        label, value,
        ...(/^[a-f0-9]{40}$/i.test(value) ? { href: `https://github.com/${repository}/commit/${value}` } : {}),
    };
}
function utcTimestamp(value) {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()))
        return value;
    return parsed.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}
function windowDetail(window, metric, percentage = false) {
    const format = (value) => percentage ? signedPercent(value) : formatFocusValue(value, metric);
    return `Mean ${format(window.mean)}; min ${format(window.min)}; max ${format(window.max)} · ${window.count}/5 points · ${window.firstDay} to ${window.lastDay}`;
}
export function focusPointDetail(metric, point, averaged) {
    const coreclrValue = metric.fixedReference ? metric.fixedReference.value : point.coreclr;
    const measurementRows = [
        { label: metric.coreclrLabel, value: formatFocusValue(coreclrValue, metric) },
        { label: metric.monoLabel, value: formatFocusValue(point.mono, metric) },
    ];
    if (metric.coreclrBeforeLabel) {
        measurementRows.push({ label: metric.coreclrBeforeLabel, value: formatFocusValue(point.coreclrBefore ?? null, metric) });
    }
    measurementRows.push({
        label: metric.comparisonLabel ?? 'CoreCLR vs Mono',
        value: point.percent === null ? 'Not available' : signedPercent(point.percent),
    });
    if (point.issue)
        measurementRows.push({ label: 'Data note', value: point.issue });
    if (averaged) {
        if (point.coreclrWindow)
            measurementRows.push({ label: `${metric.coreclrLabel} window`, value: windowDetail(point.coreclrWindow, metric) });
        if (point.monoWindow)
            measurementRows.push({ label: `${metric.monoLabel} window`, value: windowDetail(point.monoWindow, metric) });
        if (point.percentWindow)
            measurementRows.push({ label: 'Comparison window', value: windowDetail(point.percentWindow, metric, true) });
    }
    const observation = point.observation;
    const sections = [
        { title: 'Measurement', rows: measurementRows },
        { title: 'SDK', rows: [
                { label: 'Version', value: observation.sdkVersion },
                { label: 'Build day', value: `${observation.day} (UTC)` },
                { label: 'SDK commit date', value: observation.sdkCommitDateTime
                        ? utcTimestamp(observation.sdkCommitDateTime) : 'Not recorded' },
                commitRow('SDK commit', observation.sdkGitHash, 'dotnet/sdk'),
                ...(observation.vmrGitHash ? [
                    { label: 'VMR commit date', value: observation.vmrCommitDateTime
                            ? utcTimestamp(observation.vmrCommitDateTime) : 'Not recorded' },
                    commitRow('VMR commit', observation.vmrGitHash, 'dotnet/dotnet'),
                ] : []),
            ] },
        { title: 'Runtime', rows: [
                { label: 'Runtime pack', value: observation.runtimePackVersion || 'Not recorded' },
                { label: 'Runtime commit date', value: observation.runtimeCommitDateTime
                        ? utcTimestamp(observation.runtimeCommitDateTime) : 'Not recorded' },
                { label: 'Author', value: observation.runtimeCommitAuthor || 'Not recorded' },
                { label: 'Subject', value: observation.runtimeCommitMessage || 'Not recorded' },
                commitRow('Runtime commit', observation.runtimeGitHash, 'dotnet/runtime'),
            ] },
    ];
    const observationRows = [];
    if (observation.measuredAt)
        observationRows.push({ label: 'Measured at', value: utcTimestamp(observation.measuredAt) });
    if (observation.sourceId)
        observationRows.push({ label: 'Observation ID', value: observation.sourceId });
    if (observationRows.length)
        sections.push({ title: 'Observation', rows: observationRows });
    if (metric.fixedReference) {
        const reference = metric.fixedReference;
        sections.push({ title: 'Fixed reference', rows: [
                { label: reference.label, value: reference.value === null ? 'Not available' : formatFocusValue(reference.value, metric) },
                { label: 'Measured at', value: utcTimestamp(reference.measuredAt) },
                { label: 'SDK', value: reference.sdkVersion },
                commitRow('Runtime commit', reference.commit, 'dotnet/runtime'),
                ...(reference.rounds === null ? [] : [{ label: 'Rounds', value: reference.rounds.toString() }]),
            ] });
    }
    return {
        title: metric.title,
        subtitle: `${observation.sdkVersion} · ${observation.day} (UTC)`,
        sections,
    };
}
export function focusChartModel(metric, averaged, showBands, visibility = DEFAULT_FOCUS_GRAPH_VISIBILITY) {
    const configurations = metric.coreclrBeforeLabel
        ? [...SERIES, { key: 'coreclrBefore', label: metric.coreclrBeforeLabel, color: '#72a5c4', axis: 'y' }]
        : SERIES;
    const series = configurations.filter(config => !(metric.fixedReference && config.key === 'coreclr') &&
        (config.key === 'percent' ? visibility.percentage : visibility.measurements)).map(config => ({
        ...config,
        label: config.key === 'coreclr' ? metric.coreclrLabel : config.key === 'mono' ? metric.monoLabel
            : config.key === 'percent' ? metric.comparisonLabel ?? config.label : config.label,
        data: metric.points.map(point => {
            const raw = rawValue(point, config.key);
            const value = averaged ? windowFor(point, config.key)?.mean ?? null : raw;
            return { x: point.position, y: value === null ? null : value / (config.key === 'percent' ? 1 : metric.divisor) };
        }),
        windows: metric.points.map(point => windowFor(point, config.key)),
    }));
    // Keep domains stable across presentation toggles, including lookback-window extrema.
    let runtimeMax = metric.fixedReference?.value ?? 0;
    let percentMin = 0;
    let percentMax = 0;
    for (const point of metric.points) {
        for (const key of ['coreclr', 'mono', 'coreclrBefore']) {
            runtimeMax = Math.max(runtimeMax, rawValue(point, key) ?? 0, windowFor(point, key)?.max ?? 0);
        }
        percentMin = Math.min(percentMin, point.percent ?? 0, point.percentWindow?.min ?? 0);
        percentMax = Math.max(percentMax, point.percent ?? 0, point.percentWindow?.max ?? 0);
    }
    const padding = Math.max((percentMax - percentMin) * 0.1, 5);
    return {
        series, bands: averaged && showBands && series.length > 0, bandOpacity: FOCUS_BAND_OPACITY,
        reference: visibility.measurements ? metric.fixedReference ?? null : null,
        runtimeMax: Math.max(runtimeMax / metric.divisor * 1.1, 1),
        percentMin: percentMin - padding, percentMax: percentMax + padding,
        xMin: metric.points.length === 1 ? -0.5 : 0,
        xMax: metric.points.length === 1 ? 0.5 : Math.max(metric.points.length - 1, 1),
    };
}
export function fixedReferenceTooltip(reference, metric) {
    return [
        `${reference.label}: ${reference.value === null ? 'Not available' : formatFocusValue(reference.value, metric)}`,
        `Measured ${reference.measuredAt.slice(0, 10)} (UTC)`,
        `Base ${reference.commit.slice(0, 12)}${reference.dirty === true ? ' + local changes' : reference.dirty === null ? ' (source state unknown)' : ''}`,
        ...(reference.rounds === null ? [] : [`Pooled from ${reference.rounds} rounds`]),
    ];
}
export function wrapFocusTooltipText(text, maxWidth, measure) {
    if (!Number.isFinite(maxWidth) || maxWidth <= 0)
        throw new RangeError('Tooltip width must be finite and positive.');
    const lines = [];
    let line = '';
    // Keep measurement units with their values when wrapping at word boundaries.
    for (const word of text.match(/\S+(?: (?:ms|s|MiB)\b)?/g) ?? []) {
        const next = line ? `${line} ${word}` : word;
        if (line && measure(next) > maxWidth) {
            lines.push(line);
            line = word;
        }
        else {
            line = next;
        }
        while (line.length > 1 && measure(line) > maxWidth) {
            let end = 1;
            while (end < line.length && measure(line.slice(0, end + 1)) <= maxWidth)
                end++;
            lines.push(line.slice(0, end));
            line = line.slice(end);
        }
    }
    if (line)
        lines.push(line);
    return lines;
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
    cleanups = [];
    detailPanel = null;
    detailSelection = null;
    detailReturnFocus = null;
    dispose() {
        for (const cleanup of this.cleanups)
            cleanup();
        this.cleanups.length = 0;
        this.closeDetail(false);
        for (const chart of this.charts)
            chart.destroy();
        this.charts.length = 0;
    }
    closeDetail(restoreFocus = true) {
        this.detailPanel?.remove();
        this.detailPanel = null;
        this.detailSelection = null;
        const target = this.detailReturnFocus;
        this.detailReturnFocus = null;
        if (restoreFocus && target?.isConnected)
            target.focus();
    }
    showDetail(metric, point, averaged, canvas) {
        const selection = `${metric.id}:${point.position}`;
        if (this.detailPanel && this.detailSelection === selection) {
            this.closeDetail();
            return;
        }
        const detail = focusPointDetail(metric, point, averaged);
        this.closeDetail(false);
        const panel = document.createElement('aside');
        panel.className = 'focus-detail-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'false');
        const titleId = `focus-detail-title-${metric.id}`;
        panel.setAttribute('aria-labelledby', titleId);
        const header = document.createElement('div');
        header.className = 'focus-detail-header';
        const heading = document.createElement('div');
        const eyebrow = document.createElement('p');
        eyebrow.className = 'focus-detail-eyebrow';
        eyebrow.textContent = 'SELECTED GRAPH POINT';
        const title = document.createElement('h2');
        title.id = titleId;
        title.textContent = detail.title;
        const subtitle = document.createElement('p');
        subtitle.className = 'focus-detail-subtitle';
        subtitle.textContent = detail.subtitle;
        heading.append(eyebrow, title, subtitle);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'focus-detail-close';
        close.setAttribute('aria-label', 'Close graph detail panel');
        close.textContent = '×';
        close.addEventListener('click', () => this.closeDetail());
        header.append(heading, close);
        panel.append(header);
        const body = document.createElement('div');
        body.className = 'focus-detail-body';
        for (const detailSection of detail.sections) {
            const section = document.createElement('section');
            const sectionTitle = document.createElement('h3');
            sectionTitle.textContent = detailSection.title;
            const rows = document.createElement('dl');
            rows.className = 'focus-detail-rows';
            for (const row of detailSection.rows) {
                const label = document.createElement('dt');
                label.textContent = row.label;
                const value = document.createElement('dd');
                if (row.href) {
                    value.className = 'focus-detail-hash';
                    const link = document.createElement('a');
                    link.href = row.href;
                    link.target = '_blank';
                    link.rel = 'noopener';
                    link.textContent = row.value;
                    value.append(link);
                }
                else {
                    value.textContent = row.value;
                }
                rows.append(label, value);
            }
            section.append(sectionTitle, rows);
            body.append(section);
        }
        panel.append(body);
        panel.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                this.closeDetail();
            }
        });
        (canvas.closest('.net12-focus') ?? document.body).append(panel);
        this.detailPanel = panel;
        this.detailSelection = selection;
        this.detailReturnFocus = canvas;
        close.focus();
    }
    render(owner, report, averaged, showBands, visibility = DEFAULT_FOCUS_GRAPH_VISIBILITY) {
        this.dispose();
        if (!visibility.percentage && !visibility.measurements)
            return;
        for (const metric of report.metrics) {
            if (!(visibility.measurements && isPositive(metric.fixedReference?.value ?? null)) && !metric.points.some(point => (visibility.percentage && point.percent !== null)
                || (visibility.measurements && (isPositive(point.coreclr) || isPositive(point.mono)))))
                continue;
            const canvas = document.getElementById(`focus-${owner}-${metric.id}`);
            if (!(canvas instanceof HTMLCanvasElement))
                throw new Error(`Focus canvas '${metric.id}' was not rendered.`);
            const context = canvas.getContext('2d');
            if (!context)
                throw new Error(`A canvas context is unavailable for ${metric.title}.`);
            canvas.tabIndex = 0;
            canvas.setAttribute?.('aria-keyshortcuts', 'Enter Space');
            const accessibleLabel = canvas.getAttribute?.('aria-label');
            if (accessibleLabel && !accessibleLabel.includes('Press Enter')) {
                canvas.setAttribute('aria-label', `${accessibleLabel} Click a point to toggle SDK, VMR, and runtime commit details. Press Enter to toggle the latest visible point.`);
            }
            const model = focusChartModel(metric, averaged, showBands, visibility);
            const latestVisibleIndex = (() => {
                for (let index = metric.points.length - 1; index >= 0; index--) {
                    if (model.series.some(series => rawValue(metric.points[index], series.key) !== null))
                        return index;
                }
                return -1;
            })();
            if (typeof canvas.addEventListener === 'function') {
                const keydown = (event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && latestVisibleIndex >= 0) {
                        event.preventDefault();
                        this.showDetail(metric, metric.points[latestVisibleIndex], averaged, canvas);
                    }
                };
                canvas.addEventListener('keydown', keydown);
                this.cleanups.push(() => canvas.removeEventListener('keydown', keydown));
            }
            const tooltipSize = averaged ? 10 : 12;
            const tooltipPadding = 4;
            const wrapTooltip = (text, title = false) => {
                context.save();
                context.font = `${title ? 'bold ' : ''}${tooltipSize}px Arial`;
                // Reserve the native color box and padding, not just the text width.
                const inset = 2 * tooltipPadding + (title ? 0 : tooltipSize + 4);
                const lines = wrapFocusTooltipText(text, Math.max(1, canvas.clientWidth - inset), value => context.measureText(value).width);
                context.restore();
                return lines;
            };
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
                    if (model.reference?.value !== null && model.reference?.value !== undefined) {
                        const y = scales.y.getPixelForValue(model.reference.value / metric.divisor);
                        ctx.strokeStyle = RUNTIME_COLORS.coreclr;
                        ctx.lineWidth = 2;
                        ctx.setLineDash([6, 4]);
                        ctx.beginPath();
                        ctx.moveTo(chartArea.left, y);
                        ctx.lineTo(chartArea.right, y);
                        ctx.stroke();
                        ctx.setLineDash([]);
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
                    onClick: (_event, elements) => {
                        const point = metric.points[elements[0]?.index];
                        if (point)
                            this.showDetail(metric, point, averaged, canvas);
                    },
                    onHover: (_event, elements) => {
                        canvas.style.cursor = elements.length ? 'pointer' : 'default';
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            enabled: true,
                            titleFont: { family: 'Arial', size: tooltipSize, lineHeight: averaged ? 1 : 1.1 },
                            bodyFont: { family: 'Arial', size: tooltipSize, lineHeight: averaged ? 1 : 1.1 },
                            padding: tooltipPadding, bodySpacing: 0, titleSpacing: 0, titleMarginBottom: 2,
                            boxWidth: tooltipSize, boxHeight: tooltipSize, boxPadding: 2,
                            callbacks: {
                                title(items) {
                                    const point = metric.points[items[0]?.dataIndex];
                                    return point ? [
                                        point.observation.sdkVersion,
                                        `${metric.fixedReference ? 'Before source' : report.comparisonKind === 'local' ? 'Comparison' : 'SDK'} day ${point.observation.day} (UTC)`,
                                        ...(point.observation.runtimeCommitDateTime
                                            ? [`Runtime pack commit ${point.observation.runtimeCommitDateTime.slice(0, 10)} (UTC)`] : []),
                                    ].flatMap(text => wrapTooltip(text, true)) : [];
                                },
                                label(item) {
                                    const series = model.series[item.datasetIndex];
                                    const point = metric.points[item.dataIndex];
                                    const raw = rawValue(point, series.key);
                                    const format = (value) => series.key === 'percent' ? signedPercent(value) : formatFocusValue(value, metric);
                                    const lines = [`${model.series[item.datasetIndex].label} raw: ${raw === null ? 'Not available' : format(raw)}`];
                                    const window = windowFor(point, series.key);
                                    if (averaged && window) {
                                        const unit = series.key === 'percent' ? '%' : ` ${metric.unit}`;
                                        const withoutUnit = (value) => {
                                            const text = format(value);
                                            return text.endsWith(unit) ? text.slice(0, -unit.length) : text;
                                        };
                                        lines.push(`Mean ${withoutUnit(window.mean)}; min ${withoutUnit(window.min)}; max ${format(window.max)}`);
                                        lines.push(`${window.count}/5 points: ${window.firstDay} to ${window.lastDay}`);
                                        lines.push(`From SDK ${window.firstSdk}`);
                                    }
                                    return lines.flatMap(text => wrapTooltip(text));
                                },
                                footer: () => metric.fixedReference
                                    ? fixedReferenceTooltip(metric.fixedReference, metric).flatMap(text => wrapTooltip(text)) : [],
                            },
                        },
                    },
                    scales: {
                        x: {
                            type: 'linear', min: model.xMin, max: model.xMax,
                            title: { display: !!metric.fixedReference, text: 'Before source snapshot date (UTC)', font: { size: 8 } },
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
