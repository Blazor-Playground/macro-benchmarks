import test from 'node:test';
import assert from 'node:assert/strict';
import { debugBatch, debugResources } from '../helpers/debug-fixture.mjs';
import { parseDebugIndex, parseDebugPayload, DebugLoader } from '../../src/bench-viewer/wwwroot/chart/debug-loader.js';
import { buildDebugReport } from '../../src/bench-viewer/wwwroot/chart/debug-data.js';
import { DebugSession } from '../../src/bench-viewer/wwwroot/chart/debug-interop.js';

const now = new Date('2026-09-30T12:00:00Z');
function publication(batches = [debugBatch()]) {
    const resources = debugResources(batches);
    const index = parseDebugIndex(resources.get('index.json'));
    return { index, batches: parseDebugPayload(resources.get(index.apps[0].file), index, batches[0].app) };
}
function scaledBatch(day, scale) {
    const batch = debugBatch('havit-bootstrap', day);
    for (const runtime of Object.values(batch.runtimes)) for (const metric of Object.values(runtime.measurements)) {
        if (metric.valueMs !== null) metric.valueMs *= scale;
        for (const attempt of metric.attempts) if (attempt.valueMs !== null) attempt.valueMs *= scale;
    }
    return batch;
}
test('clean Debug has four scenarios plus optional walkthrough, never publish metric aliases', () => {
    const report = buildDebugReport(publication(), 'havit-bootstrap', '14d', now);
    assert.deepEqual(report.metrics.map(m => m.id), ['first-run', 'incremental-run', 'hot-reload', 'rebuild', 'walkthrough']);
    assert.equal(report.metrics[0].mono.valueMs, 1000);
    assert.equal(report.metrics[0].coreclr.valueMs, 1250);
    assert.equal(report.metrics[0].comparison.value, 25);
    assert.equal(report.metrics[2].comparison, null);
    assert.equal(report.metrics[2].mono.valueMs, 5000);
    assert.equal(report.metrics[2].coreclr.status, 'unsupported-runtime');
    assert.equal(report.metrics[3].buildMono.valueMs, 4000);
    assert.match(report.rawDataPath, /^data\/views\/debug\/generations\/[a-f0-9]{64}\/havit-bootstrap.json$/);
});
test('Debug labels distinguish command-start timing from save-to-render timing', () => {
    const report = buildDebugReport(publication(), 'havit-bootstrap', '14d', now);
    const byId = Object.fromEntries(report.metrics.map(metric => [metric.id, metric]));
    assert.equal(byId['first-run'].title, 'First dotnet run');
    assert.equal(byId['incremental-run'].title, 'Incremental dotnet run');
    assert.equal(byId['first-run'].boundary, 'Start dotnet run to first render');
    assert.equal(byId['incremental-run'].boundary, 'Start dotnet run to first render');
    assert.match(byId['incremental-run'].description, /not stopping the previous run/);
    assert.equal(byId.rebuild.title, 'Incremental rebuild');
    assert.equal(byId.rebuild.boundary, 'Save edit to updated render');
    assert.match(byId.rebuild.description, /Includes shutdown time/);
    assert.equal(byId['hot-reload'].boundary, byId.rebuild.boundary);
    assert.match(byId['hot-reload'].description, /without restarting or losing state/);
    assert.equal(byId.walkthrough.title, 'End-to-end walkthrough');
});
test('smoke, uncontrolled, partial and different-TFM results never produce comparable pairs', () => {
    for (const modify of [
        b => { b.smoke = true; },
        b => { b.environment.controlled = false; },
        b => { b.runtimes.coreclr.properties.TargetFramework = 'net11.0'; },
        b => { const m = b.runtimes.mono.measurements['debug-first-run-to-first-render']; m.requested = 6; m.status = 'partial'; m.reason = 'Partial'; },
    ]) {
        const batch = debugBatch(); modify(batch);
        assert.equal(buildDebugReport(publication([batch]), batch.app, '14d', now).metrics[0].comparison, null);
    }
});

test('full explicitly paired local batches compare without being mislabeled as CI controlled', () => {
    const batch = debugBatch();
    batch.environment.controlled = false;
    batch.environment.comparisonScope = 'local-paired';
    const report = buildDebugReport(publication([batch]), batch.app, '14d', now);
    assert.equal(report.metrics[0].comparison.value, 25);
    assert.equal(report.metrics[0].controlled, false);
    assert.equal(report.metrics[0].localPaired, true);
    batch.smoke = true;
    assert.equal(buildDebugReport(publication([batch]), batch.app, '14d', now).metrics[0].comparison, null);
    batch.environment.controlled = true;
    assert.throws(() => publication([batch]), /must not claim CI control/);
});
test('date cropping, unavailable apps and older complete pairs stay honest', () => {
    const old = debugBatch('havit-bootstrap', '2026-09-28'), latest = debugBatch();
    latest.smoke = true;
    const pub = publication([old, latest]);
    const report = buildDebugReport(pub, latest.app, '14d', now);
    assert.equal(report.metrics[0].day, '2026-09-28');
    assert.equal(report.metrics[0].olderPair, true);
    assert.equal(report.metrics[0].latest.coreclrWindow.lastDay, '2026-09-28');
    assert.equal(report.metrics[0].latest.percentWindow.count, 1);
    assert.equal(buildDebugReport(pub, latest.app, '14d', new Date('2027-01-01')).metrics[0].mono, null);
    assert.equal(buildDebugReport(pub, 'empty-blazor', '14d', now).metrics[0].mono, null);
});
test('unpaired hot reload shows the latest failure without hiding earlier successful history', () => {
    const key = 'debug-hot-reload-edit-to-render';
    const old = debugBatch('havit-bootstrap', '2026-09-28'), latest = debugBatch();
    const failure = latest.runtimes.mono.measurements[key];
    failure.status = 'launch-failed';
    failure.reason = 'dotnet exited before the expected render';
    failure.successful = 0;
    failure.valueMs = null;
    for (const attempt of failure.attempts) {
        attempt.status = failure.status;
        attempt.reason = failure.reason;
        attempt.valueMs = null;
        attempt.before = null;
        attempt.after = null;
    }
    const hot = buildDebugReport(publication([old, latest]), latest.app, '14d', now)
        .metrics.find(metric => metric.id === 'hot-reload');
    assert.equal(hot.day, latest.sdk.day);
    assert.equal(hot.mono.status, 'launch-failed');
    assert.equal(hot.mono.valueMs, null);
    assert.equal(hot.olderPair, false);
    assert.equal(hot.latest.monoWindow, null);
    assert.ok(hot.points.some(point => point.mono === old.runtimes.mono.measurements[key].valueMs));
});
test('wire validation rejects status/value lies, count mismatches, duplicate IDs and legacy presets', () => {
    for (const modify of [
        b => { b.preset = 'no-workload'; },
        b => { b.runtimes.mono.measurements['debug-first-run-to-first-render'].valueMs = 0; },
        b => { b.runtimes.coreclr.measurements['debug-hot-reload-edit-to-render'].valueMs = 12; },
        b => { b.runtimes.mono.measurements['debug-first-run-to-first-render'].attempts.forEach(a => { a.valueMs = 2000; }); },
        b => { b.runtimes.mono.properties.Configuration = 'Release'; },
    ]) {
        const batch = debugBatch(); modify(batch);
        assert.throws(() => publication([batch]));
    }
    const batch = debugBatch();
    assert.throws(() => publication([batch, batch]), /Duplicate/);
});

test('clean DevLoop results and earlier clean-Debug prototype results remain readable, not tuned history', () => {
    const current = debugBatch();
    assert.equal(current.preset, 'dev-loop');
    assert.equal(publication([current]).batches.length, 1);
    const prototype = debugBatch();
    prototype.preset = 'debug';
    assert.equal(publication([prototype]).batches.length, 1);
    prototype.id = 'earlier-clean-debug-prototype';
    assert.equal(buildDebugReport(publication([prototype, current]), current.app, '14d', now).metrics[0].points.length, 2);
    const tuned = debugBatch();
    tuned.methodology = 'tuned-dev-loop';
    assert.throws(() => publication([tuned]), /Not a supported clean-Debug cohort/);
});

test('native, translated and unknown SDK hosts remain recorded without splitting history', () => {
    const hosts = [
        ['osx-arm64', 'osx-arm64'], ['osx-x64', 'osx-x64'],
        ['osx-arm64', 'osx-x64'], [undefined, 'osx-arm64'], ['osx-arm64', undefined],
    ];
    const batches = hosts.map(([mono, coreclr], i) => {
        const batch = debugBatch();
        batch.id = `host-${i}`;
        batch.environment.os = 'darwin';
        batch.environment.arch = 'arm64';
        for (const [runtime, rid] of [['mono', mono], ['coreclr', coreclr]]) {
            const properties = batch.runtimes[runtime].properties;
            if (rid) properties.NETCoreSdkRuntimeIdentifier = rid;
            else delete properties.NETCoreSdkRuntimeIdentifier;
            for (const metric of Object.values(batch.runtimes[runtime].measurements)) {
                for (const attempt of metric.attempts) {
                    if (rid) attempt.properties.NETCoreSdkRuntimeIdentifier = rid;
                    else delete attempt.properties.NETCoreSdkRuntimeIdentifier;
                }
            }
        }
        return batch;
    });
    const pub = publication(batches);
    const report = buildDebugReport(pub, batches[0].app, '14d', now);
    assert.equal(report.metrics[0].points.length, hosts.length);
    for (const [i, batch] of pub.batches.entries()) {
        assert.equal(batch.runtimes.mono.properties.NETCoreSdkRuntimeIdentifier, hosts[i][0]);
        assert.equal(batch.runtimes.coreclr.properties.NETCoreSdkRuntimeIdentifier, hosts[i][1]);
    }
    assert.equal('cohorts' in report, false);
});
test('14-day history includes every recorded environment and source revision in range', () => {
    const batches = [
        ['2026-09-27', 'AMD EPYC 9V74', 'linux 6.17', 'v24.21.0', 16766414848],
        ['2026-09-28', 'AMD EPYC 9V74', 'linux 7.0', 'v24.22.0', 16760344576],
        ['2026-09-29', 'Intel Xeon 8370C', 'linux 6.17', 'v24.21.0', 16765374464],
        ['2026-09-30', 'AMD EPYC 9V45', 'linux 7.0', 'v24.22.0', 16760344576],
    ].map(([day, cpu, os, node, memoryBytes], i) => {
        const batch = debugBatch('havit-bootstrap', day);
        Object.assign(batch.environment, { cpu, os, node, memoryBytes });
        batch.source.harnessDigest = `harness-${i}`;
        batch.source.appDigest = `app-${i}`;
        batch.runtimes.coreclr.properties.PublishReadyToRun = i < 3 ? 'false' : 'true';
        return batch;
    });
    const old = debugBatch('havit-bootstrap', '2026-09-15');
    const future = debugBatch('havit-bootstrap', '2026-10-01');
    const report = buildDebugReport(publication([future, ...batches.toReversed(), old]), 'havit-bootstrap', '14d', now);
    for (const metric of report.metrics) {
        assert.equal(metric.points.length, 4);
        assert.deepEqual(metric.points.map(p => p.observation.day), batches.map(b => b.sdk.day));
    }
    assert.equal(report.metrics[0].day, '2026-09-30');
});
test('showing all environments never forms a runtime comparison from separate batches', () => {
    const monoOnly = debugBatch('havit-bootstrap', '2026-09-28');
    const coreclrOnly = debugBatch('havit-bootstrap', '2026-09-29');
    coreclrOnly.environment.cpu = 'Another CPU';
    for (const [batch, runtime] of [[monoOnly, 'coreclr'], [coreclrOnly, 'mono']]) {
        const metric = batch.runtimes[runtime].measurements['debug-first-run-to-first-render'];
        metric.status = 'launch-failed';
        metric.reason = 'No successful render';
        metric.valueMs = null;
        metric.successful = 0;
        for (const attempt of metric.attempts) {
            attempt.status = metric.status;
            attempt.reason = metric.reason;
            attempt.valueMs = null;
        }
    }
    const metric = buildDebugReport(publication([monoOnly, coreclrOnly]), monoOnly.app, '14d', now).metrics[0];
    assert.equal(metric.points.length, 2);
    assert.ok(metric.points.every(p => p.percent === null));
    assert.equal(metric.comparison, null);
    assert.equal(metric.mono.valueMs, null);
    assert.equal(metric.coreclr.valueMs, 1250);
});
test('5 avg uses up to five consecutive batch medians, separately from latest values and raw graphs', () => {
    const batches = Array.from({ length: 6 }, (_, i) => scaledBatch(`2026-09-${24 + i}`, i + 1));
    const report = buildDebugReport(publication(batches), 'havit-bootstrap', '14d', now);
    const first = report.metrics[0];
    assert.equal(first.coreclr.valueMs, 7500);
    assert.equal(first.mono.valueMs, 6000);
    assert.equal(first.latest.coreclrWindow.mean, 5000);
    assert.equal(first.latest.monoWindow.mean, 4000);
    assert.equal(first.latest.coreclrWindow.count, 5);
    assert.equal(first.latest.coreclrWindow.firstDay, '2026-09-25');
    assert.equal(first.latest.coreclrWindow.lastDay, '2026-09-29');
    assert.ok(first.points.every(point => point.coreclrWindow === null));
    const short = buildDebugReport(publication(batches.slice(0, 2)), 'havit-bootstrap', '14d', now).metrics[0];
    assert.equal(short.latest.coreclrWindow.count, 2);
    assert.equal(short.latest.coreclrWindow.mean, 1875);
    const hot = report.metrics.find(metric => metric.id === 'hot-reload');
    assert.equal(hot.latest.coreclrWindow, null);
    assert.equal(hot.latest.monoWindow.mean, 20000);
    assert.equal(hot.averageComparison, null);
    const rebuild = report.metrics.find(metric => metric.id === 'rebuild');
    assert.equal(rebuild.buildMonoAverage.mean, 16000);
    assert.equal(rebuild.buildCoreclrAverage.mean, 20000);
});
test('5 avg resets at failed, partial and smoke observations without hiding valid one-runtime averages', () => {
    for (const mode of ['failed', 'partial', 'smoke']) {
        const batches = Array.from({ length: 6 }, (_, i) => scaledBatch(`2026-09-${24 + i}`, i + 1));
        const gap = batches[4];
        const metric = gap.runtimes.coreclr.measurements['debug-first-run-to-first-render'];
        if (mode === 'smoke') gap.smoke = true;
        else if (mode === 'partial') {
            metric.requested = 6; metric.status = 'partial'; metric.reason = 'Partial';
        } else {
            metric.successful = 0; metric.status = 'launch-failed'; metric.reason = 'No render'; metric.valueMs = null;
            for (const attempt of metric.attempts) {
                attempt.status = metric.status; attempt.reason = metric.reason; attempt.valueMs = null;
            }
        }
        const latest = buildDebugReport(publication(batches), gap.app, '14d', now).metrics[0].latest;
        assert.equal(latest.coreclrWindow.count, 1, mode);
        assert.equal(latest.percentWindow.count, 1, mode);
        assert.equal(latest.monoWindow.count, mode === 'smoke' ? 1 : 5, mode);
    }
    const smoke = debugBatch(); smoke.smoke = true;
    const first = buildDebugReport(publication([smoke]), smoke.app, '14d', now).metrics[0];
    assert.equal(first.latest.coreclrWindow, null);
    assert.equal(first.latest.monoWindow, null);
    assert.equal(first.averageComparison, null);
});
test('5 avg percentages are means of same-batch percentages, never ratios of runtime means', () => {
    const batches = [debugBatch('havit-bootstrap', '2026-09-28'), debugBatch('havit-bootstrap', '2026-09-29')];
    for (const [batch, mono, coreclr] of [[batches[0], 1000, 2000], [batches[1], 4000, 12000]]) {
        for (const [runtime, value] of [['mono', mono], ['coreclr', coreclr]]) {
            const metric = batch.runtimes[runtime].measurements['debug-first-run-to-first-render'];
            metric.valueMs = value;
            for (const attempt of metric.attempts) attempt.valueMs = value;
        }
    }
    const metric = buildDebugReport(publication(batches), 'havit-bootstrap', '14d', now).metrics[0];
    assert.equal(metric.comparison.value, 200);
    assert.equal(metric.averageComparison.value, 150);
    assert.equal(metric.latest.percentWindow.count, 2);
    assert.equal(metric.latest.coreclrWindow.mean, 7000);
    assert.equal(metric.latest.monoWindow.mean, 2500);
});
test('5 avg keeps its pre-crop lookback but never creates a summary outside the selected range', () => {
    const batches = ['2026-09-10', '2026-09-16', '2026-09-18', '2026-09-20', '2026-09-22', '2026-09-30']
        .map((day, i) => scaledBatch(day, i + 1));
    const pub = publication(batches);
    const narrow = buildDebugReport(pub, 'havit-bootstrap', '14d', now).metrics[0];
    const wide = buildDebugReport(pub, 'havit-bootstrap', '1m', now).metrics[0];
    assert.equal(narrow.points.length, 4);
    assert.equal(wide.points.length, 6);
    assert.deepEqual(narrow.latest.coreclrWindow, wide.latest.coreclrWindow);
    assert.equal(narrow.latest.coreclrWindow.count, 5);
    const empty = buildDebugReport(pub, 'havit-bootstrap', '14d', new Date('2027-01-01')).metrics[0];
    assert.equal(empty.latest, null);
    assert.equal(empty.averageComparison, null);
});
test('Debug loader uses immutable generation resources, exposes HTTP errors and keeps source caches separate', async () => {
    const resources = debugResources(), calls = [];
    const loader = new DebugLoader(new URL('https://example.test/data/views/debug/'), async url => {
        const key = url.pathname.split('/debug/')[1]; calls.push(key);
        return new Response(JSON.stringify(resources.get(key)));
    });
    const signal = new AbortController().signal;
    await loader.load('havit-bootstrap', signal);
    await loader.load('havit-bootstrap', signal);
    assert.equal(calls.filter(c => c.includes('havit-bootstrap.json')).length, 1);
    const bad = new DebugLoader(new URL('https://example.test/'), async () => new Response('', { status: 404 }));
    await assert.rejects(() => bad.load('havit-bootstrap', signal), /HTTP 404/);
});
test('Debug ownership ignores late responses and disposes charts on navigation', async () => {
    let resolve;
    let destroyed = 0;
    const session = new DebugSession({ load: () => new Promise(r => { resolve = r; }) }, {
        render() {}, dispose() { destroyed++; },
    }, () => now);
    const pending = session.load('havit-bootstrap', '14d', false);
    session.dispose(); resolve(publication());
    assert.equal(JSON.parse(await pending).status, 'cancelled');
    assert.ok(destroyed >= 2);
});
