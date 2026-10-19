import { comparisonLabel, historyBounds, isPositive, percentVsMono } from './focus-data.js';
import { DEBUG_METRICS } from './debug-types.js';
function sdkHostRids(batch) {
    return ['mono', 'coreclr'].map(runtime => batch.runtimes[runtime].properties.NETCoreSdkRuntimeIdentifier?.trim() || null);
}
export function cohortKey(batch) {
    const { runnerId, ...environment } = batch.environment;
    const configuration = ['WasmBuildNative', 'PublishTrimmed', 'CompressionEnabled', 'WasmEnableWebcil',
        'WasmIncludeFullIcuData', 'DebugSymbols', 'MetricsSupport', 'EventSourceSupport', 'RunAOTCompilation', 'PublishReadyToRun']
        .map(key => [key, batch.runtimes.mono.properties[key] ?? '', batch.runtimes.coreclr.properties[key] ?? '']);
    return JSON.stringify([
        batch.methodology, batch.preset, batch.source.harnessDigest, batch.source.appDigest, environment, configuration, sdkHostRids(batch),
        batch.runtimes.mono.properties.TargetFramework || batch.runtimes.coreclr.properties.TargetFramework || 'unknown',
    ]);
}
export function buildDebugReport(publication, app, range, cohort, now = new Date()) {
    const bounds = historyBounds(range, now);
    const eligible = publication.batches.filter(b => b.sdk.version.startsWith('12.') && b.sdk.day !== null)
        .sort((a, b) => a.sdk.day.localeCompare(b.sdk.day) || a.sdk.version.localeCompare(b.sdk.version, 'en', { numeric: true })
        || a.measuredAt.localeCompare(b.measuredAt) || a.id.localeCompare(b.id));
    const cohortMap = new Map();
    for (const batch of eligible) {
        const key = cohortKey(batch);
        const [monoHost, coreclrHost] = sdkHostRids(batch);
        cohortMap.set(key, `${batch.environment.os} / ${batch.environment.arch} / SDK hosts: Mono ${monoHost ?? 'unknown'}, CoreCLR ${coreclrHost ?? 'unknown'} / ${batch.environment.browserChannel} ${batch.environment.browser} / ${batch.runtimes.mono.properties.TargetFramework || batch.runtimes.coreclr.properties.TargetFramework || 'unknown TFM'} / ${batch.source.appDigest.slice(0, 8)}`);
    }
    const selected = cohort || (eligible.length ? cohortKey(eligible.at(-1)) : '');
    const batches = eligible.filter(b => cohortKey(b) === selected && b.sdk.day >= bounds.startDay && b.sdk.day <= bounds.endDay);
    const metrics = DEBUG_METRICS.map(definition => {
        const points = batches.map((batch, position) => {
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
        const pairIndex = points.map(p => p.percent !== null).lastIndexOf(true);
        const displayIndex = pairIndex >= 0 ? pairIndex : batches.length - 1;
        const batch = batches[displayIndex];
        const mono = batch?.runtimes.mono.measurements[definition.key], coreclr = batch?.runtimes.coreclr.measurements[definition.key];
        const anyData = points.some(p => isPositive(p.mono) || isPositive(p.coreclr));
        return {
            ...definition, coreclrLabel: 'CoreCLR Debug', monoLabel: 'Mono Debug', points,
            status: pairIndex >= 0 ? 'ready' : anyData ? 'incomplete-pair' : 'unavailable',
            message: batches.length ? 'Only complete, non-smoke, explicitly paired same-runner batches produce a comparison. Local experiments do not imply CI or hardware isolation. Unsupported and failed results remain gaps.'
                : 'No clean-Debug SDK12 observations in this cohort and date window. Tuned DevLoop history and publish measurements are not substitutes.',
            comparison: pairIndex >= 0 ? comparisonLabel(points[pairIndex].percent, definition.unit) : null,
            mono: mono ?? null,
            coreclr: coreclr ?? null,
            buildMono: definition.id === 'rebuild' ? batch?.runtimes.mono.measurements['debug-incremental-build'] ?? null : null,
            buildCoreclr: definition.id === 'rebuild' ? batch?.runtimes.coreclr.measurements['debug-incremental-build'] ?? null : null,
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
        cohort: selected,
        cohorts: [...cohortMap].map(([id, label]) => ({ id, label })), metrics,
    };
}
