import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicationFor } from '../helpers/focus-fixture.mjs';
import { focusPointDetail, wrapFocusTooltipText } from '../../src/bench-viewer/wwwroot/chart/focus-chart.js';
import { buildFocusReport, formatFocusValue } from '../../src/bench-viewer/wwwroot/chart/focus-data.js';

test('native tooltip text wraps at word boundaries without dropping labels or measurements', () => {
    const text = 'CoreCLR publish (native-relink) raw: 142,094 ms';
    const lines = wrapFocusTooltipText(text, 18, value => value.length);
    assert.deepEqual(lines, ['CoreCLR publish', '(native-relink)', 'raw: 142,094 ms']);
    assert.equal(lines.join(' '), text);
});

test('a long SDK token wraps without truncation', () => {
    const sdk = '12.0.100-alpha.1.26471.111';
    const lines = wrapFocusTooltipText(sdk, 10, value => value.length);
    assert(lines.every(line => line.length <= 10));
    assert.equal(lines.join(''), sdk);
});

test('measurement units do not end up alone on a line', () => {
    for (const unit of ['ms', 's', 'MiB']) {
        assert.deepEqual(wrapFocusTooltipText(`Mono raw: 25,207 ${unit}`, 16, value => value.length),
            ['Mono raw:', `25,207 ${unit}`]);
    }
});

test('tooltip wrapping measures rendered width rather than character count', () => {
    const measure = value => [...value].reduce((width, letter) => width + (letter === 'W' ? 3 : 1), 0);
    const lines = wrapFocusTooltipText('WWW iii', 5, measure);
    assert.deepEqual(lines, ['W', 'W', 'W', 'iii']);
    assert(lines.every(line => measure(line) <= 5));
    assert.deepEqual(wrapFocusTooltipText('', 5, measure), []);
    assert.deepEqual(wrapFocusTooltipText('iii', 5, measure), ['iii']);
});

test('invalid tooltip widths are rejected explicitly', () => {
    for (const width of [0, -1, NaN, Infinity]) {
        assert.throws(() => wrapFocusTooltipText('text', width, value => value.length), /finite and positive/);
    }
});

test('selected point details expose full SDK and runtime provenance with exact metric values', () => {
    const report = buildFocusReport(publicationFor('havit-bootstrap'), 'havit-bootstrap', '14d', new Date('2026-09-20'));
    const metric = report.metrics.find(item => item.id === 'download');
    const point = metric.latest;
    const detail = focusPointDetail(metric, point, true);
    const rows = new Map(detail.sections.flatMap(section =>
        section.rows.map(row => [`${section.title}/${row.label}`, row])));
    const utc = value => new Date(value).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');

    assert.equal(detail.title, 'Cold download size');
    assert.equal(rows.get(`Measurement/${metric.coreclrLabel}`).value, formatFocusValue(point.coreclr, metric));
    assert.equal(rows.get('SDK/SDK commit date').value, utc(point.observation.sdkCommitDateTime));
    assert.equal(rows.get('SDK/SDK commit').value, point.observation.sdkGitHash);
    assert.equal(rows.get('SDK/SDK commit').href, `https://github.com/dotnet/sdk/commit/${point.observation.sdkGitHash}`);
    assert.equal(rows.get('SDK/VMR commit').href, `https://github.com/dotnet/dotnet/commit/${point.observation.vmrGitHash}`);
    assert.equal(rows.get('SDK/VMR commit date').value, utc(point.observation.vmrCommitDateTime));
    assert.equal(rows.get('Runtime/Runtime pack').value, point.observation.runtimePackVersion);
    assert.equal(rows.get('Runtime/Author').value, point.observation.runtimeCommitAuthor);
    assert.equal(rows.get('Runtime/Subject').value, point.observation.runtimeCommitMessage);
    assert.equal(rows.get('Runtime/Runtime commit').value, point.observation.runtimeGitHash);
    assert.equal(rows.get('Runtime/Runtime commit').href, `https://github.com/dotnet/runtime/commit/${point.observation.runtimeGitHash}`);
    assert.match(rows.get('Runtime/Runtime commit date').value, / UTC$/);
    assert.match(rows.get(`Measurement/${metric.coreclrLabel} window`).value, /5\/5 points/);
});

test('historical point details show missing SDK and VMR dates without inferring them', () => {
    const report = buildFocusReport(publicationFor('havit-bootstrap'), 'havit-bootstrap', '14d', new Date('2026-09-20'));
    const metric = report.metrics.find(item => item.id === 'download');
    const point = {
        ...metric.latest,
        observation: { ...metric.latest.observation, sdkCommitDateTime: null, vmrCommitDateTime: null },
    };
    const rows = new Map(focusPointDetail(metric, point, false).sections.flatMap(section =>
        section.rows.map(row => [`${section.title}/${row.label}`, row.value])));
    assert.equal(rows.get('SDK/SDK commit date'), 'Not recorded');
    assert.equal(rows.get('SDK/VMR commit date'), 'Not recorded');
});
