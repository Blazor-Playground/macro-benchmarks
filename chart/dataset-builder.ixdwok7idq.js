// Build Chart.js datasets from release and week bucket data
import { fetchJson } from './data-fetcher.js';
import { ENGINE_COLORS, PRESET_DASH, RUNTIME_MARKER, PROFILE_LINE_WIDTH, BUILD_METRICS, WALKTHROUGH_METRICS, } from './constants.js';
export function parseRowKey(key) {
    const [runtime, preset, profile, engine] = key.split('/');
    return { runtime, preset, profile, engine };
}
export function isRowVisible(rowKey, filters, metric) {
    const d = parseRowKey(rowKey);
    // Build-time and walkthrough metrics: only show chrome/desktop (values are identical or only collected there)
    if (BUILD_METRICS.has(metric) || WALKTHROUGH_METRICS.has(metric)) {
        if (d.engine !== 'chrome' || d.profile !== 'desktop')
            return false;
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
export function formatRowLabel(rowKey, metric) {
    if (BUILD_METRICS.has(metric) || WALKTHROUGH_METRICS.has(metric)) {
        // Strip redundant /desktop/chrome for build-time, disk-size, and walkthrough metrics
        const d = parseRowKey(rowKey);
        return `${d.runtime}/${d.preset}`;
    }
    return rowKey;
}
export function makeDatasetStyle(rowKey) {
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
export async function buildReleasePoints(dataBaseUrl, app, metric, releaseBuckets, releaseTickMap) {
    const frozenPointsByRow = {};
    const filteredBuckets = releaseBuckets.filter(bucket => {
        const bucketMetrics = bucket.header.apps?.[app];
        return bucketMetrics && bucketMetrics.includes(metric);
    });
    const metricResults = await Promise.all(filteredBuckets.map(bucket => fetchJson(`${dataBaseUrl}/${bucket.path}/${app}_${metric}.json`)));
    for (let ri = 0; ri < filteredBuckets.length; ri++) {
        const bucket = filteredBuckets[ri];
        const metricData = metricResults[ri];
        if (!metricData)
            continue;
        const cols = bucket.header.columns || [];
        const tickDates = releaseTickMap.get(bucket.label) || [];
        for (const [rowKey, values] of Object.entries(metricData)) {
            const points = values.map((v, i) => {
                const col = cols[i];
                const tickDate = tickDates[i];
                if (!tickDate || v == null)
                    return null;
                return {
                    x: tickDate,
                    y: v,
                    _colIndex: i,
                    _bucket: bucket.path,
                    _bucketType: 'release',
                    _sdkVersion: col?.sdkVersion || bucket.label,
                    _releaseLabel: bucket.label,
                };
            }).filter(p => p != null);
            if (points.length === 0)
                continue;
            if (!frozenPointsByRow[rowKey])
                frozenPointsByRow[rowKey] = [];
            frozenPointsByRow[rowKey].push(...points);
        }
    }
    return frozenPointsByRow;
}
export async function buildWeekDatasets(dataBaseUrl, app, metric, weekBuckets) {
    const datasets = [];
    const filteredBuckets = weekBuckets.filter(bucket => {
        const bucketMetrics = bucket.header.apps?.[app];
        return bucketMetrics && bucketMetrics.includes(metric);
    });
    const metricResults = await Promise.all(filteredBuckets.map(bucket => fetchJson(`${dataBaseUrl}/${bucket.path}/${app}_${metric}.json`)));
    for (let wi = 0; wi < filteredBuckets.length; wi++) {
        const bucket = filteredBuckets[wi];
        const metricData = metricResults[wi];
        if (!metricData)
            continue;
        for (const [rowKey, values] of Object.entries(metricData)) {
            const points = values.map((v, i) => {
                const col = bucket.header.columns[i];
                if (!col || v == null)
                    return null;
                let x = new Date(col.runtimeCommitDateTime).valueOf();
                if (col.isPrerelease) {
                    // parse 11.0.100-preview.3.26161.119
                    const m = col.sdkVersion?.match(/-(\w+\.\d+\.\d+\.\d+)/);
                    if (m) {
                        const verPart = m[1].split('.'); // e.g. "preview.3.26161.119"
                        const numPart1 = parseInt(verPart[2], 10); // e.g. "26161"
                        const numPart2 = parseInt(verPart[3], 10); // e.g. "119"
                        const offsetMs = numPart1 + (numPart2 * 3600000); // 1 hour per build number
                        x += offsetMs;
                    }
                }
                return {
                    x: x,
                    y: v,
                    _colIndex: i,
                    _bucket: bucket.path,
                    _bucketType: 'week',
                    _sdkVersion: col.sdkVersion,
                };
            }).filter(p => p != null);
            if (points.length === 0)
                continue;
            // Merge with existing dataset for same rowKey if present
            const existingIdx = datasets.findIndex(d => d._rowKey === rowKey && d._zone === 'active');
            if (existingIdx >= 0) {
                datasets[existingIdx].data.push(...points);
            }
            else {
                datasets.push({
                    label: formatRowLabel(rowKey, metric),
                    data: points,
                    ...makeDatasetStyle(rowKey),
                    _rowKey: rowKey,
                    _zone: 'active',
                });
            }
        }
    }
    return datasets;
}
export function mergeDatasets(activeDatasets, frozenPointsByRow, metric) {
    const mergedDatasets = [];
    const consumedFrozenRows = new Set();
    for (const ds of activeDatasets) {
        if (ds._zone !== 'active')
            continue;
        ds.data.sort((a, b) => a.x - b.x);
        const frozenPts = frozenPointsByRow[ds._rowKey];
        if (frozenPts && frozenPts.length > 0) {
            frozenPts.sort((a, b) => a.x - b.x);
            ds.data = [...frozenPts, ...ds.data];
            consumedFrozenRows.add(ds._rowKey);
        }
        mergedDatasets.push(ds);
    }
    // Add standalone datasets for frozen-only rows (no active data)
    for (const [rowKey, points] of Object.entries(frozenPointsByRow)) {
        if (consumedFrozenRows.has(rowKey))
            continue;
        if (points.length === 0)
            continue;
        points.sort((a, b) => a.x - b.x);
        mergedDatasets.push({
            label: formatRowLabel(rowKey, metric),
            data: points,
            ...makeDatasetStyle(rowKey),
            _rowKey: rowKey,
            _zone: 'frozen',
        });
    }
    return mergedDatasets;
}
