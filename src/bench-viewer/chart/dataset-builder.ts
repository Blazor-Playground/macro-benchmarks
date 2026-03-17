// Build Chart.js datasets from release and week bucket data

import { fetchJson } from './data-fetcher.js';
import type { Bucket } from './data-fetcher.js';
import type { TickLayout } from './tick-layout.js';
import {
    ENGINE_COLORS, PRESET_DASH, RUNTIME_MARKER, PROFILE_LINE_WIDTH,
    BUILD_METRICS, WALKTHROUGH_METRICS, assert,
} from './constants.js';

export interface Filters {
    runtimes: string[];
    presets: string[];
    profiles: string[];
    engines: string[];
}

export function parseRowKey(key: string): { runtime: string; preset: string; profile: string; engine: string } {
    const [runtime, preset, profile, engine] = key.split('/');
    return { runtime, preset, profile, engine };
}

export function isRowVisible(rowKey: string, filters: Filters, metric: string): boolean {
    const d = parseRowKey(rowKey);
    // Build-time and walkthrough metrics: only show chrome/desktop (values are identical or only collected there)
    if (BUILD_METRICS.has(metric) || WALKTHROUGH_METRICS.has(metric)) {
        if (d.engine !== 'chrome' || d.profile !== 'desktop') return false;
        // Skip engine/profile filters — always display if runtime and preset match
        return filters.runtimes.includes(d.runtime)
            && filters.presets.includes(d.preset);
    }
    // Firefox, v8, and node only collect desktop profile — skip profile filter for them
    const skipProfileFilter = d.engine === 'firefox' || d.engine === 'v8' || d.engine === 'node';
    return filters.runtimes.includes(d.runtime)
        && filters.presets.includes(d.preset)
        && (skipProfileFilter || filters.profiles.includes(d.profile))
        && filters.engines.includes(d.engine);
}

export function formatRowLabel(rowKey: string, metric: string): string {
    if (BUILD_METRICS.has(metric) || WALKTHROUGH_METRICS.has(metric)) {
        // Strip redundant /desktop/chrome for build-time, disk-size, and walkthrough metrics
        const d = parseRowKey(rowKey);
        return `${d.runtime}/${d.preset}`;
    }
    return rowKey;
}

export function makeDatasetStyle(rowKey: string): Record<string, unknown> {
    const d = parseRowKey(rowKey);
    return {
        borderColor: ENGINE_COLORS[d.engine] || '#999',
        backgroundColor: (ENGINE_COLORS[d.engine] || '#999') + '33',
        borderDash: PRESET_DASH[d.preset] || [],
        borderWidth: PROFILE_LINE_WIDTH[d.profile] || 1,
        pointStyle: RUNTIME_MARKER[d.runtime] || 'circle',
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0,
        fill: false,
    };
}

export async function buildReleasePoints(dataBaseUrl: string, app: string, metric: string, releaseBuckets: Bucket[], tickLayout: TickLayout): Promise<Record<string, ChartDataPoint[]>> {
    const frozenPointsByRow: Record<string, ChartDataPoint[]> = {};

    const filteredBuckets = releaseBuckets.filter(bucket => {
        const bucketMetrics = bucket.header.apps?.[app];
        return bucketMetrics && bucketMetrics.includes(metric);
    });
    const metricResults = await Promise.all(
        filteredBuckets.map(bucket =>
            fetchJson<Record<string, (number | null)[]>>(`${dataBaseUrl}/${bucket.path}/${app}_${metric}.json`)
        )
    );

    for (let ri = 0; ri < filteredBuckets.length; ri++) {
        const bucket = filteredBuckets[ri];
        const metricData = metricResults[ri];
        if (!metricData) continue;

        const cols = bucket.header.columns;
        const positions = tickLayout.releasePositions.get(bucket.label);
        assert(positions, `missing release positions for bucket '${bucket.label}'`);

        for (const [rowKey, values] of Object.entries(metricData)) {
            for (let i = 0; i < values.length; i++) {
                const v = values[i];
                if (v == null) continue;
                const col = cols[i];
                assert(col, `missing column[${i}] in ${bucket.path}`);
                assert(positions[i] != null, `missing position[${i}] for bucket '${bucket.label}'`);
                if (!frozenPointsByRow[rowKey]) frozenPointsByRow[rowKey] = [];
                frozenPointsByRow[rowKey].push({
                    x: positions[i],
                    y: v,
                    colIndex: i,
                    bucket: bucket.path,
                    bucketType: 'release',
                    sdkVersion: col.sdkVersion,
                    releaseLabel: bucket.label,
                });
            }
        }
    }

    return frozenPointsByRow;
}

export async function buildWeekDatasets(dataBaseUrl: string, app: string, metric: string, weekBuckets: Bucket[], tickLayout: TickLayout): Promise<ChartDatasetBase[]> {
    const datasets: ChartDatasetBase[] = [];

    const filteredBuckets = weekBuckets.filter(bucket => {
        const bucketMetrics = bucket.header.apps?.[app];
        return bucketMetrics && bucketMetrics.includes(metric);
    });
    const metricResults = await Promise.all(
        filteredBuckets.map(bucket =>
            fetchJson<Record<string, (number | null)[]>>(`${dataBaseUrl}/${bucket.path}/${app}_${metric}.json`)
        )
    );

    for (let wi = 0; wi < filteredBuckets.length; wi++) {
        const bucket = filteredBuckets[wi];
        const metricData = metricResults[wi];
        if (!metricData) continue;

        const positions = tickLayout.dailyPositions.get(bucket.path);
        assert(positions, `missing daily positions for bucket '${bucket.path}'`);

        for (const [rowKey, values] of Object.entries(metricData)) {
            const points: ChartDataPoint[] = [];
            for (let i = 0; i < values.length; i++) {
                const v = values[i];
                if (v == null) continue;
                const col = bucket.header.columns[i];
                assert(col, `missing column[${i}] in ${bucket.path}`);
                assert(positions[i] != null, `missing position[${i}] for bucket '${bucket.path}'`);
                points.push({
                    x: positions[i],
                    y: v,
                    colIndex: i,
                    bucket: bucket.path,
                    bucketType: 'week',
                    sdkVersion: col.sdkVersion,
                });
            }

            if (points.length === 0) continue;

            const existingIdx = datasets.findIndex(
                d => d.rowKey === rowKey && d.zone === 'active'
            );
            if (existingIdx >= 0) {
                datasets[existingIdx].data.push(...points);
            } else {
                datasets.push({
                    label: formatRowLabel(rowKey, metric),
                    data: points,
                    ...makeDatasetStyle(rowKey),
                    rowKey: rowKey,
                    zone: 'active',
                });
            }
        }
    }

    return datasets;
}

export function mergeDatasets(activeDatasets: ChartDatasetBase[], frozenPointsByRow: Record<string, ChartDataPoint[]>, metric: string): ChartDatasetBase[] {
    const mergedDatasets: ChartDatasetBase[] = [];
    const consumedFrozenRows = new Set<string>();

    for (const ds of activeDatasets) {
        if (ds.zone !== 'active') continue;
        ds.data.sort((a, b) => a.x - b.x);

        const frozenPts = frozenPointsByRow[ds.rowKey];
        if (frozenPts && frozenPts.length > 0) {
            frozenPts.sort((a, b) => a.x - b.x);
            ds.data = [...frozenPts, ...ds.data];
            consumedFrozenRows.add(ds.rowKey);
        }
        mergedDatasets.push(ds);
    }

    // Add standalone datasets for frozen-only rows (no active data)
    for (const [rowKey, points] of Object.entries(frozenPointsByRow)) {
        if (consumedFrozenRows.has(rowKey)) continue;
        if (points.length === 0) continue;
        points.sort((a, b) => a.x - b.x);
        mergedDatasets.push({
            label: formatRowLabel(rowKey, metric),
            data: points,
            ...makeDatasetStyle(rowKey),
            rowKey: rowKey,
            zone: 'frozen',
        });
    }

    return mergedDatasets;
}
