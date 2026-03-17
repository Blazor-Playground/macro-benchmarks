// Chart.js instance creation, configuration, and plugins
import { METRIC_UNITS, METRIC_DISPLAY } from './constants.js';
import { getCached } from './data-fetcher.js';
import { isRowVisible } from './dataset-builder.js';
export function formatValue(value, unit) {
    if (value == null)
        return '—';
    if (unit === 'bytes') {
        if (value >= 1048576)
            return (value / 1048576).toFixed(2) + ' MB';
        if (value >= 1024)
            return (value / 1024).toFixed(2) + ' KB';
        return value + ' B';
    }
    if (unit === 's') {
        return Math.round(value / 1000) + ' s';
    }
    if (unit === 'ms') {
        return value >= 1000
            ? Math.round(value).toLocaleString() + ' ms'
            : value.toFixed(1) + ' ms';
    }
    if (unit === 'ops/sec') {
        return Math.round(value).toLocaleString() + ' ops/sec';
    }
    return String(value);
}
// ── Chart.js Plugin: Frozen release zone separator ───────────────────────────
const frozenZonePlugin = {
    id: 'frozenZone',
    beforeDraw(chart) {
        const meta = chart.options.plugins?.frozenZone;
        if (!meta || !meta.dividerDates || !meta.dividerDates.length)
            return;
        const xScale = chart.scales.x;
        if (!xScale)
            return;
        const { ctx, chartArea } = chart;
        ctx.save();
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        for (const d of meta.dividerDates) {
            const x = xScale.getPixelForValue(new Date(d));
            if (x == null || isNaN(x))
                continue;
            if (x < chartArea.left || x > chartArea.right)
                continue;
            ctx.beginPath();
            ctx.moveTo(x, chartArea.top);
            ctx.lineTo(x, chartArea.bottom);
            ctx.stroke();
        }
        ctx.restore();
    }
};
Chart.register(frozenZonePlugin);
// ── Chart Creation ───────────────────────────────────────────────────────────
export function createChart(canvas, canvasId, metric, mergedDatasets, filters, dataBaseUrl, pointClickCallback, tickLayout) {
    const unit = METRIC_UNITS[metric] || '';
    const displayName = METRIC_DISPLAY[metric] || metric;
    const { dividerDates, tickMap: tickToSdk } = tickLayout;
    // Convert x from number to Date for Chart.js time scale
    for (const ds of mergedDatasets) {
        for (const pt of ds.data) {
            pt.x = new Date(pt.x);
        }
    }
    const config = {
        type: 'line',
        data: { datasets: mergedDatasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'nearest',
                intersect: false,
            },
            plugins: {
                title: {
                    display: true,
                    text: displayName,
                    font: { size: 14, weight: 'bold' },
                    align: 'start',
                },
                legend: {
                    display: true,
                    position: 'bottom',
                    maxHeight: 60,
                    labels: {
                        usePointStyle: true,
                        boxWidth: 8,
                        font: { size: 10 },
                        padding: 6,
                    },
                },
                tooltip: {
                    callbacks: {
                        title(items) {
                            if (!items.length)
                                return '';
                            const pt = items[0].raw;
                            if (pt.bucketType === 'release') {
                                return `Release: ${pt.sdkVersion}`;
                            }
                            return `Date: ${new Date(pt.x).toLocaleDateString()}`;
                        },
                        afterTitle(items) {
                            if (!items.length)
                                return '';
                            const pt = items[0].raw;
                            const header = getCached(`${dataBaseUrl}/${pt.bucket}/header.json`);
                            if (!header)
                                return '';
                            const col = header.columns[pt.colIndex];
                            if (!col)
                                return '';
                            const lines = [];
                            lines.push(`SDK: ${col.sdkVersion}`);
                            lines.push(`Runtime: ${col.runtimeGitHash.substring(0, 7)}`);
                            return lines.join('\n');
                        },
                        label(ctx) {
                            return `${ctx.dataset.label}: ${formatValue(ctx.raw.y, unit)}`;
                        },
                    },
                },
                zoom: {
                    pan: { enabled: true, mode: 'x' },
                    zoom: {
                        wheel: { enabled: true, modifierKey: 'ctrl' },
                        pinch: { enabled: true },
                        mode: 'x',
                    },
                },
                frozenZone: dividerDates.length > 0 ? { dividerDates } : {},
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        tooltipFormat: 'MMM d, yyyy',
                    },
                    grid: { display: false },
                    title: { display: true, text: 'SDK Version' },
                    ticks: {
                        source: 'data',
                        callback(value) {
                            const ts = typeof value === 'number' ? value : new Date(value).getTime();
                            const ver = tickToSdk.get(ts);
                            if (!ver)
                                return '';
                            // Shorten: e.g. "11.0.100-preview.3.26153.117" → "preview.3.26153"
                            const m = ver.match(/-(\w+\.\d+\.\d+\.\d+)/);
                            return m
                                ? m[1].replace(`preview.`, 'p').replace(`alpha.`, 'a').replace(`beta.`, 'b')
                                : ver;
                        },
                        maxRotation: 90,
                        minRotation: 90,
                        autoSkip: true,
                    },
                },
                y: {
                    title: { display: true, text: unit },
                    ticks: {
                        callback(value) {
                            return formatValue(value, unit);
                        },
                    },
                },
            },
            parsing: {
                xAxisKey: 'x',
                yAxisKey: 'y',
            },
            onClick(_event, elements) {
                if (!elements.length)
                    return;
                const el = elements[0];
                const ds = config.data.datasets[el.datasetIndex];
                const pt = ds.data[el.index];
                const detail = {
                    rowKey: ds._rowKey,
                    colIndex: pt.colIndex,
                    bucket: pt.bucket,
                    bucketType: pt.bucketType,
                    value: pt.y,
                    metric: metric,
                };
                const detailJson = JSON.stringify(detail);
                // Call C# callback if registered, otherwise dispatch DOM event
                if (pointClickCallback) {
                    try {
                        pointClickCallback(detailJson);
                    }
                    catch (e) {
                        console.warn('Point click callback error:', e);
                    }
                }
                document.dispatchEvent(new CustomEvent('chartPointClick', {
                    detail: detailJson,
                }));
            },
        },
    };
    // Destroy any existing chart on this canvas (safety net)
    const existing = Chart.getChart(canvas);
    if (existing)
        existing.destroy();
    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, config);
    chart._metric = metric;
    // Apply initial filter visibility
    for (let i = 0; i < chart.data.datasets.length; i++) {
        const ds = chart.data.datasets[i];
        if (ds._rowKey) {
            chart.setDatasetVisibility(i, isRowVisible(ds._rowKey, filters, metric));
        }
    }
    chart.update('none');
    // Shift+wheel zoom (complement to Ctrl+wheel handled by plugin)
    canvas.addEventListener('wheel', (e) => {
        if (e.shiftKey && !e.ctrlKey) {
            e.preventDefault();
            const speed = 0.1;
            const amount = 1 + (e.deltaY >= 0 ? -speed : speed);
            chart.zoom(amount);
        }
    }, { passive: false });
    return chart;
}
