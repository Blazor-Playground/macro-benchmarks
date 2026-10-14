import test from 'node:test';
import assert from 'node:assert/strict';
import { debugBatch, debugResources } from '../helpers/debug-fixture.mjs';
import { parseDebugIndex, parseDebugPayload, DebugLoader } from '../../src/bench-viewer/wwwroot/chart/debug-loader.js';
import { buildDebugReport, cohortKey } from '../../src/bench-viewer/wwwroot/chart/debug-data.js';
import { DebugSession } from '../../src/bench-viewer/wwwroot/chart/debug-interop.js';

const now = new Date('2026-09-30T12:00:00Z');
function publication(batches = [debugBatch()]) {
    const resources = debugResources(batches);
    const index = parseDebugIndex(resources.get('index.json'));
    return { index, batches: parseDebugPayload(resources.get(index.apps[0].file), index, batches[0].app) };
}
test('clean Debug has four scenarios plus optional walkthrough, never publish metric aliases', () => {
    const report = buildDebugReport(publication(), 'havit-bootstrap', '14d', '', now);
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
    const report = buildDebugReport(publication(), 'havit-bootstrap', '14d', '', now);
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
        assert.equal(buildDebugReport(publication([batch]), batch.app, '14d', '', now).metrics[0].comparison, null);
    }
});

test('full explicitly paired local batches compare without being mislabeled as CI controlled', () => {
    const batch = debugBatch();
    batch.environment.controlled = false;
    batch.environment.comparisonScope = 'local-paired';
    const report = buildDebugReport(publication([batch]), batch.app, '14d', '', now);
    assert.equal(report.metrics[0].comparison.value, 25);
    assert.equal(report.metrics[0].controlled, false);
    assert.equal(report.metrics[0].localPaired, true);
    batch.smoke = true;
    assert.equal(buildDebugReport(publication([batch]), batch.app, '14d', '', now).metrics[0].comparison, null);
    batch.environment.controlled = true;
    assert.throws(() => publication([batch]), /must not claim CI control/);
});
test('date cropping, unavailable apps, source/environment cohorts and older complete pairs stay honest', () => {
    const old = debugBatch('havit-bootstrap', '2026-09-28'), latest = debugBatch();
    latest.smoke = true;
    const pub = publication([old, latest]);
    const report = buildDebugReport(pub, latest.app, '14d', '', now);
    assert.equal(report.metrics[0].day, '2026-09-28');
    assert.equal(report.metrics[0].olderPair, true);
    assert.equal(buildDebugReport(pub, latest.app, '14d', '', new Date('2027-01-01')).metrics[0].mono, null);
    const different = structuredClone(pub.batches[0]); different.source.harnessDigest = 'new';
    assert.notEqual(cohortKey(different), cohortKey(pub.batches[0]));
    const documentationOnly = structuredClone(pub.batches[0]); documentationOnly.source.harnessSha = 'new-commit';
    assert.equal(cohortKey(documentationOnly), cohortKey(pub.batches[0]));
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
    const hot = buildDebugReport(publication([old, latest]), latest.app, '14d', '', now)
        .metrics.find(metric => metric.id === 'hot-reload');
    assert.equal(hot.day, latest.sdk.day);
    assert.equal(hot.mono.status, 'launch-failed');
    assert.equal(hot.mono.valueMs, null);
    assert.equal(hot.olderPair, false);
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
    assert.notEqual(cohortKey(publication([prototype]).batches[0]), cohortKey(publication([current]).batches[0]));
    const tuned = debugBatch();
    tuned.methodology = 'tuned-dev-loop';
    assert.throws(() => publication([tuned]), /Not a supported clean-Debug cohort/);
});

test('SDK host RIDs separate native, translated and unknown history for each runtime', () => {
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
    assert.equal(new Set(pub.batches.map(cohortKey)).size, hosts.length);
    for (const batch of pub.batches) {
        const report = buildDebugReport(pub, batch.app, '14d', cohortKey(batch), now);
        assert.equal(report.cohorts.length, hosts.length);
        assert.equal(report.metrics[0].points.length, 1);
    }
    const unknown = pub.batches[3];
    const empty = structuredClone(unknown);
    empty.runtimes.mono.properties.NETCoreSdkRuntimeIdentifier = '';
    assert.equal(cohortKey(unknown), cohortKey(empty));
    const labels = buildDebugReport(pub, batches[0].app, '14d', '', now).cohorts.map(c => c.label);
    assert.ok(labels.some(label => label.includes('SDK hosts: Mono osx-x64, CoreCLR osx-x64')));
    assert.ok(labels.some(label => label.includes('SDK hosts: Mono unknown, CoreCLR osx-arm64')));
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
    const pending = session.load('havit-bootstrap', '14d', '', false);
    session.dispose(); resolve(publication());
    assert.equal(JSON.parse(await pending).status, 'cancelled');
    assert.ok(destroyed >= 2);
});
