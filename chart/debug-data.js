import { comparisonLabel, historyBounds, isPositive, percentVsMono, rollingWindows } from './focus-data.js';
import { DEBUG_METRICS } from './debug-types.js';
function measurementWindows(batches, runtime, key) {
    return rollingWindows(batches.map(batch => {
        const metric = batch.runtimes[runtime].measurements[key];
        return !batch.smoke && metric?.status === 'ok' && isPositive(metric.valueMs) ? metric.valueMs : null;
    }), batches.map(batch => ({ sdkVersion: batch.sdk.version, day: batch.sdk.day })));
}
export function buildDebugReport(publication, app, range, now = new Date()) {
    const bounds = historyBounds(range, now);
    const allBatches = publication.batches.filter(b => b.app === app && b.sdk.day !== null && b.sdk.version.startsWith('12.'))
        .sort((a, b) => a.sdk.day.localeCompare(b.sdk.day) || a.sdk.version.localeCompare(b.sdk.version, 'en', { numeric: true })
        || a.measuredAt.localeCompare(b.measuredAt) || a.id.localeCompare(b.id));
    const batches = allBatches.filter(b => b.sdk.day >= bounds.startDay && b.sdk.day <= bounds.endDay);
    const metrics = DEBUG_METRICS.map(definition => {
        const allPoints = allBatches.map((batch, position) => {
            const mono = batch.runtimes.mono.measurements[definition.key];
            const coreclr = batch.runtimes.coreclr.measurements[definition.key];
            const paired = batch.environment.controlled || batch.environment.comparisonScope === 'local-paired';
            const match = !batch.smoke && paired && mono?.status === 'ok' && coreclr?.status === 'ok'
                && batch.runtimes.mono.properties.TargetFramework === batch.runtimes.coreclr.properties.TargetFramework;
            const percent = match ? percentVsMono(coreclr.valueMs, mono.valueMs) : null;
            return {
                observation: { sdkVersion: batch.sdk.version, day: batch.sdk.day }, position,
                mono: mono?.valueMs ?? null, coreclr: coreclr?.valueMs ?? null, percent,
                issue: match ? null : 'No complete same-batch paired measurement',
                monoWindow: null, coreclrWindow: null, percentWindow: null,
            };
        });
        const points = allPoints.filter(point => point.observation.day >= bounds.startDay && point.observation.day <= bounds.endDay);
        points.forEach((point, position) => { point.position = position; });
        const pairIndex = points.map(p => p.percent !== null).lastIndexOf(true);
        const displayIndex = pairIndex >= 0 ? pairIndex : batches.length - 1;
        const batch = batches[displayIndex];
        const fullIndex = batch ? allBatches.indexOf(batch) : -1;
        // Keep the same pre-crop lookback as Focus without changing the raw chart series.
        const latest = points[displayIndex] ? {
            ...points[displayIndex],
            monoWindow: measurementWindows(allBatches, 'mono', definition.key)[fullIndex] ?? null,
            coreclrWindow: measurementWindows(allBatches, 'coreclr', definition.key)[fullIndex] ?? null,
            percentWindow: rollingWindows(allPoints.map(point => point.percent), allPoints.map(point => point.observation))[fullIndex] ?? null,
        } : null;
        const mono = batch?.runtimes.mono.measurements[definition.key], coreclr = batch?.runtimes.coreclr.measurements[definition.key];
        const anyData = points.some(p => isPositive(p.mono) || isPositive(p.coreclr));
        return {
            ...definition, coreclrLabel: 'CoreCLR Debug', monoLabel: 'Mono Debug', points, latest,
            status: pairIndex >= 0 ? 'ready' : anyData ? 'incomplete-pair' : 'unavailable',
            message: batches.length ? 'Only complete, non-smoke, explicitly paired same-runner batches produce a comparison. Local experiments do not imply CI or hardware isolation. Unsupported and failed results remain gaps.'
                : 'No SDK12 Debug observations in this SDK date window. Tuned DevLoop history and publish measurements are not substitutes.',
            comparison: pairIndex >= 0 ? comparisonLabel(points[pairIndex].percent, definition.unit) : null,
            averageComparison: latest?.percentWindow ? comparisonLabel(latest.percentWindow.mean, definition.unit) : null,
            mono: mono ?? null,
            coreclr: coreclr ?? null,
            buildMono: definition.id === 'rebuild' ? batch?.runtimes.mono.measurements['debug-incremental-build'] ?? null : null,
            buildCoreclr: definition.id === 'rebuild' ? batch?.runtimes.coreclr.measurements['debug-incremental-build'] ?? null : null,
            buildMonoAverage: definition.id === 'rebuild' ? measurementWindows(allBatches, 'mono', 'debug-incremental-build')[fullIndex] ?? null : null,
            buildCoreclrAverage: definition.id === 'rebuild' ? measurementWindows(allBatches, 'coreclr', 'debug-incremental-build')[fullIndex] ?? null : null,
            sdk: batch?.sdk.version ?? null, day: batch?.sdk.day ?? null, measuredAt: batch?.measuredAt ?? null,
            olderPair: pairIndex >= 0 && pairIndex < batches.length - 1,
            smoke: batch?.smoke ?? false, controlled: batch?.environment.controlled ?? false,
            localPaired: batch?.environment.comparisonScope === 'local-paired',
        };
    });
    return {
        app, apps: [...new Set(['empty-blazor', 'havit-bootstrap', ...publication.index.apps.map(a => a.id)])],
        range, ...bounds, lastUpdated: publication.index.lastUpdated,
        rawDataPath: publication.index.apps.some(a => a.id === app)
            ? `data/views/debug/${publication.index.apps.find(a => a.id === app).file}` : null,
        metrics,
    };
}
