// Chart.js interop module for Blazor dashboard — orchestration facade
// Called from C# via [JSImport] to fetch data and render charts
import { MICROBENCH_SKIP_METRICS } from './constants.js';
import { fetchJson, getCached, collectBuckets, prefetchMetricData } from './data-fetcher.js';
import { computeReleaseTickMap } from './tick-layout.js';
import { buildReleasePoints, buildWeekDatasets, mergeDatasets, isRowVisible } from './dataset-builder.js';
import { createChart } from './chart-factory.js';
// ── State ────────────────────────────────────────────────────────────────────
let dataBaseUrl = '';
const charts = {};
let viewIndex = null;
let loadGeneration = 0;
let pointClickCallback = null;
let showReleases = true;
let showDailyReleases = true;
// ── Exported Functions ───────────────────────────────────────────────────────
export async function initDashboard(baseUrl) {
    dataBaseUrl = baseUrl.replace(/\/$/, '');
    const url = `${dataBaseUrl}/index.json`;
    viewIndex = await fetchJson(url);
    // Fetch all bucket headers and filter apps to only those with actual data
    const appsWithData = new Set();
    const allHeaderPromises = [
        ...viewIndex.releases.map(rel => fetchJson(`${dataBaseUrl}/releases/${rel}/header.json`)),
        ...viewIndex.weeks.map(week => fetchJson(`${dataBaseUrl}/${week}/header.json`)),
    ];
    const allHeaders = await Promise.all(allHeaderPromises);
    for (const header of allHeaders) {
        if (header?.apps)
            Object.keys(header.apps).forEach(a => appsWithData.add(a));
    }
    viewIndex.apps = viewIndex.apps.filter(a => appsWithData.has(a));
    return JSON.stringify(viewIndex);
}
export async function loadAppCharts(app, filtersJson) {
    if (!viewIndex)
        return '[]';
    const filters = JSON.parse(filtersJson);
    let metrics = viewIndex.metrics[app] || [];
    if (app === 'micro-benchmarks') {
        metrics = metrics.filter(m => !MICROBENCH_SKIP_METRICS.has(m));
    }
    destroyAllCharts();
    const gen = ++loadGeneration;
    const { releaseBuckets, weekBuckets } = await collectBuckets(dataBaseUrl, viewIndex, showDailyReleases);
    const releaseTickMap = computeReleaseTickMap(releaseBuckets, weekBuckets);
    await prefetchMetricData(dataBaseUrl, app, metrics, releaseBuckets, weekBuckets, showReleases, showDailyReleases);
    const rendered = [];
    for (const metric of metrics) {
        if (gen !== loadGeneration)
            return JSON.stringify(rendered);
        const canvasId = `chart-${app}-${metric}`;
        const canvas = document.getElementById(canvasId);
        if (!canvas)
            continue;
        const frozenPointsByRow = showReleases
            ? await buildReleasePoints(dataBaseUrl, app, metric, releaseBuckets, releaseTickMap)
            : {};
        const activeDatasets = await buildWeekDatasets(dataBaseUrl, app, metric, weekBuckets);
        const mergedDatasets = mergeDatasets(activeDatasets, frozenPointsByRow, metric);
        if (mergedDatasets.length === 0)
            continue;
        charts[canvasId] = createChart(canvas, canvasId, metric, mergedDatasets, filters, dataBaseUrl, pointClickCallback);
        rendered.push(metric);
    }
    return JSON.stringify(rendered);
}
export function applyFilters(filtersJson) {
    const filters = JSON.parse(filtersJson);
    for (const [, chart] of Object.entries(charts)) {
        const metric = chart._metric || '';
        for (let i = 0; i < chart.data.datasets.length; i++) {
            const ds = chart.data.datasets[i];
            if (ds._rowKey) {
                chart.setDatasetVisibility(i, isRowVisible(ds._rowKey, filters, metric));
            }
        }
        chart.update('none');
    }
}
export function getColumnMetadata(bucket, colIndex) {
    const header = getCached(`${dataBaseUrl}/${bucket}/header.json`);
    if (!header || !header.columns[colIndex])
        return '{}';
    return JSON.stringify(header.columns[colIndex]);
}
export async function getPointMetrics(app, bucket, rowKey, colIndex) {
    const header = getCached(`${dataBaseUrl}/${bucket}/header.json`);
    if (!header)
        return '{}';
    const appMetrics = header.apps?.[app] || [];
    const result = {};
    const metricResults = await Promise.all(appMetrics.map(metric => fetchJson(`${dataBaseUrl}/${bucket}/${app}_${metric}.json`)));
    for (let i = 0; i < appMetrics.length; i++) {
        const metricData = metricResults[i];
        if (metricData && metricData[rowKey] && metricData[rowKey][colIndex] != null) {
            result[appMetrics[i]] = metricData[rowKey][colIndex];
        }
    }
    return JSON.stringify(result);
}
export function destroyAllCharts() {
    for (const id of Object.keys(charts)) {
        if (charts[id]) {
            charts[id].destroy();
            delete charts[id];
        }
    }
}
export function destroyChart(canvasId) {
    if (charts[canvasId]) {
        charts[canvasId].destroy();
        delete charts[canvasId];
    }
}
export function registerPointClickCallback(callback) {
    pointClickCallback = callback;
}
export function setShowReleases(show) {
    showReleases = !!show;
}
export function setShowDailyReleases(show) {
    showDailyReleases = !!show;
}
export function scrollChartsToTop() {
    document.querySelector('.charts-area')?.scrollTo(0, 0);
}
