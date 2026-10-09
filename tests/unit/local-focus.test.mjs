import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { localFocusReport } from '../../src/bench-viewer/wwwroot/chart/local-focus.js';
import { focusChartModel } from '../../src/bench-viewer/wwwroot/chart/focus-chart.js';

test('default NET12 flavor/profile controls have no stray Razor closing brace in sidebar markup', async () => {
    const page = await readFile(new URL('../../src/bench-viewer/Pages/Net12Focus.razor', import.meta.url), 'utf8');
    assert.doesNotMatch(page, /<\/div>\s*\}\s*<div class="focus-selection-control">/);
});

function fixture() {
    const run = (modified, cold) => ({
        manifest: {
            runtime: 'coreclr', preset: 'no-workload', variant: 'no-workload',
            sdkInfo: {
                sdkVersion: '11.0.100-rc.1.fixture', major: 11, channel: '11.0',
                runtimeGitHash: '0123456789abcdef', runtimePackVersion: '12.0.0-dev',
                bundledFrameworkTfm: 'net11.0',
                localRuntime: { source: { dirty: modified } },
            },
        },
        results: ['desktop', 'mobile'].map(profile => ({
            meta: { app: 'havit-bootstrap', runtime: 'coreclr', preset: 'no-workload',
                profile, engine: 'chrome', benchmarkDateTime: '2026-10-08T12:00:00Z' },
            metrics: {
                'time-to-reach-managed-cold': cold * (profile === 'mobile' ? 2 : 1),
                'time-to-reach-managed-warm': cold - 100,
                'havit-walkthrough': 9000, 'compile-time': 40000, 'download-size-cold': 5000000,
            },
            samples: { 'time-to-reach-managed-cold': 5, 'time-to-reach-managed-warm': 3 },
        })),
    });
    return {
        schemaVersion: 1, title: 'Validation: artificial startup delay', note: 'Disposable test only',
        createdAt: '2026-10-08T12:01:00Z', warnings: [], before: run(false, 400), after: run(true, 2400),
    };
}

test('local mode shows measured after/before without relabeling CoreCLR as Mono or certifying stock SDK data', () => {
    const result = localFocusReport(fixture(), 'desktop');
    assert.equal(result.report.comparisonKind, 'local');
    assert.deepEqual(result.report.targetFrameworks, ['net11.0']);
    assert.equal(result.metadata.beforeSdk, '11.0.100-rc.1.fixture');
    assert.equal(result.metadata.afterPack, '12.0.0-dev');
    assert.equal(result.metadata.beforeDirty, false);
    assert.equal(result.metadata.afterDirty, true);
    const startup = result.report.metrics[0];
    assert.equal(startup.latest.mono, 400);
    assert.equal(startup.latest.coreclr, 2400);
    assert.equal(startup.comparison.magnitude, '500.0%');
    assert.equal(startup.comparison.verdict, 'slower');
    assert.equal(startup.comparison.tone, 'worse');
    assert.equal(startup.coreclrLabel, 'After (CoreCLR interpreter)');
    assert.equal(startup.monoLabel, 'Before (CoreCLR interpreter)');
    assert.equal(startup.monoRowKey, 'before/coreclr/no-workload/desktop/chrome');
    assert.equal(startup.averageComparison, null);
    assert.equal(result.report.metrics.length, 4);
});

test('local startup profile changes only startup; desktop cards retain exact recorded rows', () => {
    const result = localFocusReport(fixture(), 'mobile');
    assert.equal(result.report.metrics[0].latest.mono, 800);
    assert.equal(result.report.metrics[0].latest.coreclr, 4800);
    assert.deepEqual(result.report.metrics.map(metric => metric.profile), ['mobile', 'desktop', 'desktop', 'desktop']);
    assert.equal(result.report.metrics[2].latest.coreclr, 5000000);
    const model = focusChartModel(result.report.metrics[0], false, false, { measurements: true, percentage: true });
    assert.deepEqual(model.series.map(series => series.label), ['After (CoreCLR interpreter)', 'Before (CoreCLR interpreter)', 'After vs before (%)']);
});

test('local default follows NET12 mobile startup while other cards stay desktop', () => {
    const result = localFocusReport(fixture());
    assert.equal(result.report.startupProfile, 'mobile');
    assert.deepEqual(result.report.metrics.map(metric => metric.profile), ['mobile', 'desktop', 'desktop', 'desktop']);
    assert.equal(result.report.metrics[0].latest.coreclr, 4800);
    assert.equal(result.report.metrics[0].latest.mono, 800);
});

test('local mode rejects mismatched runtimes, incoherent variants, duplicate rows and missing profile pairs', () => {
    assert.throws(() => localFocusReport({}), /Invalid local comparison/);
    const mismatch = fixture();
    mismatch.after.manifest.runtime = 'mono';
    mismatch.after.results.forEach(result => { result.meta.runtime = 'mono'; });
    assert.throws(() => localFocusReport(mismatch), /same runtime/);
    const incoherent = fixture();
    incoherent.after.manifest.variant = 'composite';
    assert.throws(() => localFocusReport(incoherent), /variant\/preset pairing/);
    const duplicate = fixture();
    duplicate.after.results.push(duplicate.after.results[0]);
    assert.throws(() => localFocusReport(duplicate), /Duplicate after local row/);
    const noMobile = fixture();
    noMobile.before.results = noMobile.before.results.filter(result => result.meta.profile === 'desktop');
    assert.throws(() => localFocusReport(noMobile, 'mobile'), /No paired Chromium mobile/);
});

test('invalid/missing metric data remains unavailable and is never converted into a fabricated zero', () => {
    const data = fixture();
    delete data.after.results[0].metrics['download-size-cold'];
    const download = localFocusReport(data).report.metrics[2];
    assert.equal(download.status, 'incomplete-pair');
    assert.equal(download.comparison, null);
    assert.equal(download.latest, null);
    assert.equal(download.points[0].coreclr, null);
    assert.equal(download.points[0].mono, 5000000);
});

test('Mono reference makes the main percentage CoreCLR-after versus Mono-before and keeps CoreCLR change secondary', () => {
    const data = fixture();
    data.monoBefore = structuredClone(data.before);
    data.monoBefore.manifest.runtime = 'mono';
    data.monoBefore.results.forEach(result => {
        result.meta.runtime = 'mono';
        result.metrics['time-to-reach-managed-cold'] = 200;
    });
    const result = localFocusReport(data, 'desktop');
    const startup = result.report.metrics[0];
    assert.equal(result.metadata.primaryFormula, '100 × (CoreCLR after / Mono before − 1)');
    assert.equal(result.metadata.hasMonoReference, true);
    assert.equal(startup.comparison.magnitude, '1100.0%');
    assert.equal(startup.secondaryComparison.magnitude, '500.0%');
    assert.equal(startup.latest.coreclrBefore, 400);
    assert.equal(startup.monoRowKey, 'before/mono/no-workload/desktop/chrome');
    const model = focusChartModel(startup, false, false);
    assert.deepEqual(model.series.map(series => series.label),
        ['After (CoreCLR interpreter)', 'Before (Mono interpreter)', 'Before (CoreCLR interpreter)']);
    assert.deepEqual(model.series.map(series => series.data[0].y), [2400, 200, 400]);
    data.monoBefore.manifest.sdkInfo.runtimeGitHash = 'different-commit';
    assert.throws(() => localFocusReport(data), /same baseline commit/);
});

test('cross-variant local report explicitly identifies interpreter, R2R and composite R2R without relabeling measurements', () => {
    const data = fixture();
    data.monoBefore = structuredClone(data.before);
    data.monoBefore.manifest.runtime = 'mono';
    data.monoBefore.results.forEach(result => { result.meta.runtime = 'mono'; });
    data.before.manifest.preset = 'aot';
    data.before.manifest.variant = 'aot';
    data.before.results.forEach(result => { result.meta.preset = 'aot'; });
    data.after.manifest.preset = 'aot';
    data.after.manifest.variant = 'composite';
    data.after.results.forEach(result => { result.meta.preset = 'aot'; });
    const result = localFocusReport(data, 'desktop');
    const startup = result.report.metrics[0];
    const chart = focusChartModel(startup, false, false);
    assert.deepEqual(chart.series.map(series => series.label),
        ['After (CoreCLR publish/R2R composite)', 'Before (Mono interpreter)', 'Before (CoreCLR publish/R2R)']);
    assert.equal(result.metadata.beforeLabel, 'Before (CoreCLR publish/R2R)');
    assert.equal(result.metadata.afterLabel, 'After (CoreCLR publish/R2R composite)');
    assert.equal(result.report.cohort.monoPreset, 'no-workload');
    assert.deepEqual(chart.series.map(series => series.data[0].y), [2400, 400, 400]);
});
