import assert from 'node:assert/strict';
import { test } from 'node:test';
import { focusFixture, monoGaFixture, publicationFor } from '../helpers/focus-fixture.mjs';
import { parseFocusHeader } from '../../src/bench-viewer/wwwroot/chart/focus-loader.js';
import { buildFocusReport } from '../../src/bench-viewer/wwwroot/chart/focus-data.js';
import { baselineSourceTooltip, focusPointDetail } from '../../src/bench-viewer/wwwroot/chart/focus-chart.js';

const source = (ref, digit, sdkVersion, targetFramework) => ({
    repo: 'dotnet/runtime', ref, commit: digit.repeat(40), committedAt: '2026-09-19T10:00:00Z',
    commitAuthor: 'Fixture', commitMessage: `${ref} source`,
    ...(sdkVersion === undefined ? {} : { sdkVersion }),
    ...(targetFramework === undefined ? {} : { targetFramework }),
    runtimePackVersion: `${ref === 'main' ? '12' : '11'}.0.0-fixture`,
});
function splitFixture(fixture = focusFixture()) {
    const publication = publicationFor('havit-bootstrap', fixture);
    const bucket = publication.buckets.filter(item => item.header.columns.some(column => column.major === 12)).at(-1);
    const column = bucket.header.columns.at(-1);
    column.runtimeSources = {
        mono: source('release/11.0', 'a', '11.0.100', 'net11.0'),
        coreclr: source('main', 'b', '12.0.100', 'net12.0'),
    };
    column.runtimeGitHash = column.runtimeSources.coreclr.commit;
    bucket.header = parseFocusHeader(bucket.header, bucket.path);
    return { publication, bucket, column: bucket.header.columns.at(-1) };
}
const report = publication => buildFocusReport(publication, 'havit-bootstrap', '14d',
    new Date('2026-09-20T23:59:59Z'), { flavor: 'release-release', startupProfile: 'desktop' });

test('published runtimeSources survives normalization and reaches each actual arm tooltip, not the legacy CoreCLR anchor', () => {
    const { publication, bucket, column } = splitFixture();
    assert.deepEqual(parseFocusHeader(JSON.parse(JSON.stringify(bucket.header)), bucket.path), bucket.header);
    const result = report(publication);
    const point = result.metrics[0].points.at(-1);
    assert.match(result.cohort.baselineDescription, /not a same-source pair/);
    assert.deepEqual(point.observation.variant.runtimeSources, column.runtimeSources);
    assert.equal(point.baselineSources.mono.repo, 'dotnet/runtime');
    assert.equal(point.baselineSources.mono.commit, 'a'.repeat(40));
    assert.equal(point.baselineSources.coreclr.commit, 'b'.repeat(40));
    assert.equal(point.baselineSources.mono.sdk, '11.0.100');
    assert.equal(point.baselineSources.coreclr.sdk, '12.0.100');
    assert.equal(point.baselineSources.mono.tfm, 'net11.0');
    assert.equal(point.baselineSources.coreclr.tfm, 'net12.0');
    assert.match(baselineSourceTooltip(point, 'mono').join(' '), /dotnet\/runtime release\/11.0 aaaaaaaaaaaa; SDK 11.0.100; net11.0/);
    assert.match(baselineSourceTooltip(point, 'coreclr').join(' '), /dotnet\/runtime main bbbbbbbbbbbb; SDK 12.0.100; net12.0/);
    assert.equal(baselineSourceTooltip(point, 'percent').length, 2);
});

test('partial published maps and absent Mono SDK/TFM remain unknown, never inherited from legacy or CoreCLR values', () => {
    const { publication, bucket } = splitFixture();
    const column = bucket.header.columns.at(-1);
    column.runtimeSources.mono = source('release/11.0', 'a');
    bucket.header = parseFocusHeader(bucket.header, bucket.path);
    const point = report(publication).metrics[0].points.at(-1);
    assert.equal(point.baselineSources.mono.sdk, null);
    assert.equal(point.baselineSources.mono.tfm, null);
    assert.match(baselineSourceTooltip(point, 'mono').join(' '), /SDK Not recorded; TFM Not recorded/);
    assert.doesNotMatch(baselineSourceTooltip(point, 'mono').join(' '), /12.0.100|net12.0/);
    delete bucket.header.columns.at(-1).runtimeSources.coreclr;
    const partial = report(publication).metrics[0].points.at(-1);
    assert.deepEqual(Object.keys(partial.baselineSources), ['mono']);
    assert.deepEqual(baselineSourceTooltip(partial, 'coreclr'), []);
    assert.equal(partial.observation.variant.runtimeGitHash, 'b'.repeat(40), 'Legacy column identity remains an anchor, not an invented missing descriptor');
});

test('a GA fallback never inherits the source descriptor of an unmeasured Mono arm', () => {
    const { publication, bucket } = splitFixture(monoGaFixture());
    const row = 'mono/no-workload/desktop/chrome';
    const coreRow = 'coreclr/no-workload/desktop/chrome';
    const metric = 'time-to-reach-managed-cold';
    bucket.metrics[metric][row][bucket.header.columns.length - 1] = null;
    bucket.environments = { [metric]: { [coreRow]: bucket.header.columns.map(() => [{ os: 'Core host', arch: 'x64' }]) } };
    const ga = publication.buckets.find(item => item.path === 'releases/net11');
    ga.environments = { [metric]: { [row]: [[{ os: 'GA host', arch: 'arm64' }]] } };
    const point = report(publication).metrics[0].points.at(-1);
    assert.equal(point.monoBaseline.sdkVersion, '11.0.100');
    assert.equal(point.mono, 100);
    assert.equal(point.baselineSources.mono, undefined);
    assert.equal(point.baselineSources.coreclr.commit, 'b'.repeat(40));
    assert.deepEqual(baselineSourceTooltip(point, 'mono'), []);
    assert.deepEqual(point.environments.mono, [{ os: 'GA host', arch: 'arm64' }]);
    assert.deepEqual(point.environments.coreclr, [{ os: 'Core host', arch: 'x64' }]);
});

test('old headers keep their previous normalized meaning and points have no invented per-arm provenance', () => {
    const publication = publicationFor('havit-bootstrap', focusFixture());
    const bucket = publication.buckets.at(-1);
    const parsed = parseFocusHeader(bucket.header, bucket.path);
    assert.ok(parsed.columns.every(column => !Object.hasOwn(column, 'runtimeSources')));
    const point = report(publication).metrics[0].points.at(-1);
    assert.equal(point.baselineSources, undefined);
    assert.deepEqual(baselineSourceTooltip(point, 'mono'), []);
    assert.deepEqual(baselineSourceTooltip(point, 'coreclr'), []);
});

test('published observation identity includes distinct Mono source/toolchain metadata with the same CoreCLR anchor', () => {
    const { publication, bucket } = splitFixture();
    const original = bucket.header.columns.at(-1);
    const other = structuredClone(original);
    other.runtimeSources.mono.commit = 'c'.repeat(40);
    other.runtimeSources.mono.sdkVersion = '11.0.101';
    bucket.header.columns.push(other);
    for (const rows of Object.values(bucket.metrics)) for (const values of Object.values(rows)) values.push(values.at(-1));
    const points = report(publication).metrics[0].points.filter(point =>
        point.observation.variant.runtimeGitHash === original.runtimeGitHash);
    assert.equal(points.length, 2);
    assert.notEqual(points[0].observation.id, points[1].observation.id);
    assert.deepEqual(new Set(points.map(point => point.baselineSources.mono.commit)),
        new Set(['a'.repeat(40), 'c'.repeat(40)]));
});

test('malformed explicit published provenance fails visibly rather than falling back to the legacy column', () => {
    const { bucket } = splitFixture();
    for (const mutate of [
        column => { column.runtimeSources.mono.commit = 'bad'; },
        column => { column.runtimeSources.mono.committedAt = 'not-a-date'; },
        column => { column.runtimeSources.mono = null; },
        column => { column.runtimeSources = []; },
    ]) {
        const header = structuredClone(bucket.header);
        mutate(header.columns.at(-1));
        assert.throws(() => parseFocusHeader(header, bucket.path), /runtimeSources/);
    }
});

test('custom source builds remain excluded without parsing their unused source descriptors', () => {
    const publication = publicationFor('havit-bootstrap', focusFixture());
    const bucket = publication.buckets.at(-1);
    const column = bucket.header.columns.at(-1);
    column.isRuntimeCustomBuild = true;
    column.runtimeSources = { mono: { commit: 'unused-invalid-descriptor' } };
    bucket.header = parseFocusHeader(bucket.header, bucket.path);
    const result = report(publication);
    assert.equal(bucket.header.columns.at(-1).runtimeSources, undefined);
    assert.equal(result.excludedCustomBuilds, 5);
    assert.ok(result.metrics[0].points.every(point => point.observation.bucket !== bucket.path
        || point.observation.columnIndex !== bucket.header.columns.length - 1));
});

test('main point-detail panels expose both actual runtime sources without treating the CoreCLR anchor as shared', () => {
    const { publication } = splitFixture();
    const metric = report(publication).metrics[0];
    const detail = focusPointDetail(metric, metric.points.at(-1), false);
    const mono = detail.sections.find(section => section.title === 'Mono runtime source');
    const coreclr = detail.sections.find(section => section.title === 'CoreCLR runtime source');
    assert.equal(mono.rows.find(row => row.label === 'Runtime commit').value, 'a'.repeat(40));
    assert.equal(coreclr.rows.find(row => row.label === 'Runtime commit').value, 'b'.repeat(40));
    assert.equal(mono.rows.find(row => row.label === 'SDK').value, '11.0.100');
    assert.equal(coreclr.rows.find(row => row.label === 'SDK').value, '12.0.100');
    assert.ok(detail.sections.some(section => section.title === 'SDK (CoreCLR comparison anchor)'));
});

test('main point-detail unknown SDK/TFM and absent runtime arm stay Not recorded', () => {
    const { publication, bucket } = splitFixture();
    const column = bucket.header.columns.at(-1);
    column.runtimeSources.mono.sdkVersion = null;
    column.runtimeSources.mono.targetFramework = null;
    delete column.runtimeSources.coreclr;
    const metric = report(publication).metrics[0];
    const detail = focusPointDetail(metric, metric.points.at(-1), false);
    const mono = detail.sections.find(section => section.title === 'Mono runtime source');
    assert.equal(mono.rows.find(row => row.label === 'SDK').value, 'Not recorded');
    assert.equal(mono.rows.find(row => row.label === 'Target framework').value, 'Not recorded');
    assert.deepEqual(detail.sections.find(section => section.title === 'CoreCLR runtime source').rows,
        [{ label: 'Source', value: 'Not recorded' }]);
});
