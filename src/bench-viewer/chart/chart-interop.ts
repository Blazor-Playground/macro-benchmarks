// Chart.js interop module for Blazor dashboard — orchestration facade
// Called from C# via [JSImport] to fetch data and render charts

import { MICROBENCH_SKIP_METRICS } from './constants.js';
import { fetchJson, getCached, collectBuckets, prefetchMetricData } from './data-fetcher.js';
import type { ViewIndex, BucketHeader } from './data-fetcher.js';
import { computeTickLayout } from './tick-layout.js';
import { buildReleasePoints, buildWeekDatasets, mergeDatasets, isRowVisible } from './dataset-builder.js';
import type { Filters } from './dataset-builder.js';
import { createChart } from './chart-factory.js';

// ── State ────────────────────────────────────────────────────────────────────

let dataBaseUrl = '';
const charts: Record<string, ChartInstance> = {};
let viewIndex: ViewIndex | null = null;
let loadGeneration = 0;
let pointClickCallback: ((json: string) => void) | null = null;
let showReleases = true;
let showDailyReleases = true;

// ── Exported Functions ───────────────────────────────────────────────────────

export async function initDashboard(baseUrl: string): Promise<string> {
    dataBaseUrl = baseUrl.replace(/\/$/, '');
    const url = `${dataBaseUrl}/index.json`;
    viewIndex = await fetchJson<ViewIndex>(url);

    // Fetch all bucket headers and filter apps to only those with actual data
    const appsWithData = new Set<string>();
    const allHeaderPromises = [
        ...viewIndex!.releases.map(rel => fetchJson<BucketHeader>(`${dataBaseUrl}/releases/${rel}/header.json`)),
        ...viewIndex!.weeks.map(week => fetchJson<BucketHeader>(`${dataBaseUrl}/${week}/header.json`)),
    ];
    const allHeaders = await Promise.all(allHeaderPromises);
    for (const header of allHeaders) {
        if (header?.apps) Object.keys(header.apps).forEach(a => appsWithData.add(a));
    }
    viewIndex!.apps = viewIndex!.apps.filter(a => appsWithData.has(a));

    return JSON.stringify(viewIndex);
}

export async function loadAppCharts(app: string, filtersJson: string): Promise<string> {
    if (!viewIndex) return '[]';

    const filters: Filters = JSON.parse(filtersJson);
    let metrics = viewIndex.metrics[app] || [];
    if (app === 'micro-benchmarks') {
        metrics = metrics.filter(m => !MICROBENCH_SKIP_METRICS.has(m));
    }

    destroyAllCharts();
    const gen = ++loadGeneration;

    const { releaseBuckets, weekBuckets } = await collectBuckets(dataBaseUrl, viewIndex, showDailyReleases);
    const tickLayout = computeTickLayout(releaseBuckets, weekBuckets, showReleases, showDailyReleases);
    await prefetchMetricData(dataBaseUrl, app, metrics, releaseBuckets, weekBuckets, showReleases, showDailyReleases);

    const rendered: string[] = [];

    for (const metric of metrics) {
        if (gen !== loadGeneration) return JSON.stringify(rendered);

        const canvasId = `chart-${app}-${metric}`;
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
        if (!canvas) continue;

        const frozenPointsByRow = showReleases
            ? await buildReleasePoints(dataBaseUrl, app, metric, releaseBuckets, tickLayout)
            : {};
        const activeDatasets = await buildWeekDatasets(dataBaseUrl, app, metric, weekBuckets, tickLayout);
        const mergedDatasets = mergeDatasets(activeDatasets, frozenPointsByRow, metric);

        if (mergedDatasets.length === 0) continue;

        charts[canvasId] = createChart(canvas, metric, mergedDatasets, filters, dataBaseUrl, pointClickCallback, tickLayout);
        rendered.push(metric);
    }

    return JSON.stringify(rendered);
}

export function applyFilters(filtersJson: string): void {
    const filters: Filters = JSON.parse(filtersJson);
    for (const [, chart] of Object.entries(charts)) {
        const metric = chart.metric || '';
        for (let i = 0; i < chart.data.datasets.length; i++) {
            const ds = chart.data.datasets[i];
            if (ds.rowKey) {
                chart.setDatasetVisibility(i, isRowVisible(ds.rowKey, filters, metric));
            }
        }
        chart.update('none');
    }
}

export function getColumnMetadata(bucket: string, colIndex: number): string {
    const header = getCached<BucketHeader>(`${dataBaseUrl}/${bucket}/header.json`);
    if (!header || !header.columns[colIndex]) return '{}';
    return JSON.stringify(header.columns[colIndex]);
}

export async function getPointMetrics(app: string, bucket: string, rowKey: string, colIndex: number): Promise<string> {
    const header = getCached<BucketHeader>(`${dataBaseUrl}/${bucket}/header.json`);
    if (!header) return '{}';

    const appMetrics = header.apps?.[app] || [];
    const result: Record<string, number> = {};

    const metricResults = await Promise.all(
        appMetrics.map(metric => fetchJson<Record<string, (number | null)[]>>(`${dataBaseUrl}/${bucket}/${app}_${metric}.json`))
    );
    for (let i = 0; i < appMetrics.length; i++) {
        const metricData = metricResults[i];
        if (metricData && metricData[rowKey] && metricData[rowKey][colIndex] != null) {
            result[appMetrics[i]] = metricData[rowKey][colIndex]!;
        }
    }

    return JSON.stringify(result);
}

export function destroyAllCharts(): void {
    for (const id of Object.keys(charts)) {
        if (charts[id]) {
            charts[id].destroy();
            delete charts[id];
        }
    }
}

export function destroyChart(canvasId: string): void {
    if (charts[canvasId]) {
        charts[canvasId].destroy();
        delete charts[canvasId];
    }
}

export function registerPointClickCallback(callback: (json: string) => void): void {
    pointClickCallback = callback;
}

export function setShowReleases(show: boolean): void {
    showReleases = !!show;
}

export function setShowDailyReleases(show: boolean): void {
    showDailyReleases = !!show;
}

export function scrollChartsToTop(): void {
    document.querySelector('.charts-area')?.scrollTo(0, 0);
}
