import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { localFocusReport } from '../../src/bench-viewer/wwwroot/chart/local-focus.js';
import { fixedReferenceTooltip, focusChartModel } from '../../src/bench-viewer/wwwroot/chart/focus-chart.js';

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

test('daily baseline history uses chronological source days, fixed after values and explicit gaps', () => {
    const data = fixture();
    const entry = (day, digit, cold) => {
        const before = structuredClone(data.before);
        before.manifest.sdkInfo.runtimeGitHash = digit.repeat(40);
        before.results.forEach(result => { result.metrics['time-to-reach-managed-cold'] = cold; });
        return { day, commit: digit.repeat(40), status: 'passed', before };
    };
    data.beforeHistory = [
        entry('2026-10-11', 'b', 600),
        { day: '2026-10-10', commit: 'c'.repeat(40), status: 'failed', error: 'unsupported pack' },
        entry('2026-09-30', 'a', 400),
    ];
    const result = localFocusReport(data);
    const startup = result.report.metrics[0];
    assert.deepEqual(startup.points.map(point => point.observation.day), ['2026-09-30', '2026-10-10', '2026-10-11']);
    assert.deepEqual(startup.points.map(point => point.coreclr), [null, null, null]);
    assert.equal(startup.fixedReference.value, 4800);
    assert.deepEqual(startup.points.map(point => point.mono), [400, null, 600]);
    assert.equal(startup.latest.mono, 600);
    assert.equal(startup.pairCount, 2);
    assert.match(result.metadata.note, /fixed reference/);
    assert.ok(result.metadata.warnings.some(warning => warning.includes('unsupported pack')));
    assert.equal(result.report.startDay, '2026-09-30');
    const duplicate = structuredClone(data);
    duplicate.beforeHistory.push(duplicate.beforeHistory[0]);
    assert.throws(() => localFocusReport(duplicate), /duplicate daily baseline/);
    data.beforeHistory[0].before.manifest.sdkInfo.localRuntime.source.dirty = true;
    assert.throws(() => localFocusReport(data), /clean matching-mode/);
});

test('daily pending history does not expose previous one-pair measurements as historical success', () => {
    const data = fixture();
    data.beforeHistory = [{ day: '2026-10-11', commit: 'c'.repeat(40), status: 'running' }];
    const result = localFocusReport(data);
    assert.equal(result.report.metrics[0].latest, null);
    assert.equal(result.report.metrics[0].points[0].coreclr, null);
    assert.equal(result.report.metrics[0].pairCount, 0);
    assert.equal(result.report.metrics[0].status, 'incomplete-pair');
    assert.deepEqual(result.metadata.warnings, []);
});

test('daily failures are reported once without treating queued days as errors', () => {
    const data = fixture();
    const commit = 'c'.repeat(40);
    const error = 'Runtime build failed; log: build.log\nCompiler lock exception';
    data.warnings = ['Recorded setup warning', `2026-10-10 ${commit}: ${error}`];
    data.beforeHistory = [
        { day: '2026-10-09', commit, status: 'pending' },
        { day: '2026-10-10', commit, status: 'failed', error },
        { day: '2026-10-11', commit, status: 'running' },
    ];
    assert.deepEqual(localFocusReport(data).metadata.warnings,
        ['Recorded setup warning', `2026-10-10: failed — ${error}`]);
});

test('daily three-series history uses a Mono control matched to each day rather than the original Mono baseline', () => {
    const data = fixture();
    data.beforeHistory = ['2026-09-30', '2026-10-11'].map((day, index) => {
        const before = structuredClone(data.before);
        before.manifest.sdkInfo.runtimeGitHash = String(index + 1).repeat(40);
        const monoBefore = structuredClone(before);
        monoBefore.manifest.runtime = 'mono';
        monoBefore.results.forEach(row => {
            row.meta.runtime = 'mono';
            row.metrics['time-to-reach-managed-cold'] = 100 + index * 50;
        });
        return { day, commit: before.manifest.sdkInfo.runtimeGitHash, status: 'passed', before, monoBefore };
    });
    const result = localFocusReport(data);
    const model = focusChartModel(result.report.metrics[0], false, false);
    assert.deepEqual(model.series.map(series => series.label),
        ['Before (Mono interpreter)', 'Before (CoreCLR interpreter)']);
    assert.deepEqual(model.series[0].data.map(point => point.y), [100, 150]);
    assert.deepEqual(model.series[1].data.map(point => point.y), [800, 800]);
    assert.equal(model.reference.value, 4800);
    const mismatched = structuredClone(data);
    mismatched.beforeHistory[1].monoBefore.manifest.sdkInfo.runtimeGitHash = 'f'.repeat(40);
    assert.throws(() => localFocusReport(mismatched), /same baseline commit/);
});

test('fixed after reference retains its own measured date and tree, not each baseline observation', () => {
    const data = fixture();
    data.after.manifest.sdkInfo.runtimeGitHash = 'f'.repeat(40);
    data.after.results.forEach(row => {
        row.meta.benchmarkDateTime = '2026-10-14T10:30:00Z';
        row.meta.timingAggregation = { rounds: 3 };
    });
    const before = structuredClone(data.before);
    before.manifest.sdkInfo.runtimeGitHash = 'a'.repeat(40);
    data.beforeHistory = [
        { day: '2026-09-30', commit: 'a'.repeat(40), status: 'passed', before },
        { day: '2026-10-01', commit: 'b'.repeat(40), status: 'failed' },
    ];
    const result = localFocusReport(data);
    const metric = result.report.metrics[0];
    assert.equal(result.metadata.isHistory, true);
    assert.equal(result.metadata.hasHistory, true);
    assert.equal(metric.latest.coreclr, null);
    assert.equal(metric.fixedReference.value, 4800);
    assert.deepEqual(fixedReferenceTooltip(metric.fixedReference, metric), [
        'After reference (CoreCLR interpreter): 4,800 ms',
        'Measured 2026-10-14 (UTC)',
        `Base ${'f'.repeat(12)} + local changes`,
        'Pooled from 3 rounds',
    ]);
    assert.equal(focusChartModel(metric, false, false).series.some(series => series.key === 'coreclr'), false);
    assert.equal(focusChartModel(metric, false, false, { measurements: false, percentage: true }).reference, null);
    assert.equal(metric.points[0].observation.day, '2026-09-30');
    assert.equal(metric.points[0].observation.variant.runtimeGitHash, 'a'.repeat(40));
    assert.match(metric.comparisonLabel, /Fixed after reference vs historical baseline/);
});

test('matched view is separate from history and rejects a different base or mode', () => {
    const data = fixture();
    data.beforeHistory = [{ day: '2026-10-11', commit: 'a'.repeat(40), status: 'pending' }];
    const result = localFocusReport(data, 'mobile', 'matched');
    assert.equal(result.metadata.isHistory, false);
    assert.equal(result.metadata.hasHistory, true);
    assert.equal(result.report.metrics[0].fixedReference, undefined);
    assert.equal(result.report.metrics[0].points.length, 1);
    assert.equal(result.report.metrics[0].latest.coreclr, 4800);
    data.after.manifest.sdkInfo.runtimeGitHash = 'different';
    assert.throws(() => localFocusReport(data, 'mobile', 'matched'), /same base commit/);
    assert.throws(() => localFocusReport(data, 'mobile', 'invalid'), /Select historical/);
});
