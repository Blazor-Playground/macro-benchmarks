import assert from 'node:assert/strict';
import { test } from 'node:test';
import { focusFixture, publicationFor } from '../helpers/focus-fixture.mjs';
import {
    buildFocusReport, comparisonLabel, focusMetrics, formatFocusValue, historyBounds, percentVsMono, rollingWindows,
} from '../../src/bench-viewer/wwwroot/chart/focus-data.js';
import { drawFocusBand, focusChartModel } from '../../src/bench-viewer/wwwroot/chart/focus-chart.js';
import { parseFocusHeader, parseFocusIndex, parseFocusRows } from '../../src/bench-viewer/wwwroot/chart/focus-loader.js';

const now = new Date('2026-09-20T23:59:59Z');
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const report = (app = 'havit-bootstrap', range = '14d', date = now, fixture = focusFixture()) =>
    buildFocusReport(publicationFor(app, fixture), app, range, date, { flavor: 'release-release', startupProfile: 'desktop' });

test('the pinned Release/desktop Havit values and same-endpoint 5 avg match the recorded fixture', () => {
    const result = report();
    assert.equal(result.excludedCustomBuilds, 4);
    assert.deepEqual(result.targetFrameworks, ['net11.0']);
    assert.deepEqual(result.metrics.map(metric => metric.comparison.magnitude), ['91.3%', '193.7%', '8.5%', '10.0%']);
    assert.deepEqual(result.metrics.map(metric => metric.averageComparison.magnitude), ['64.2%', '155.6%', '8.5%', '11.6%']);
    assert.deepEqual(result.metrics.map(metric => metric.comparison.verdict), ['slower', 'slower', 'larger', 'slower']);
    assert.deepEqual(result.metrics.map(metric => [metric.latest.mono, metric.latest.coreclr]),
        [[401, 767], [7567, 22227], [4575150, 4965317], [30726, 33811]]);
    for (const metric of result.metrics) {
        assert.equal(metric.pairCount, 23);
        assert.equal(metric.latest.observation.sdkVersion, '12.0.100-alpha.1.26469.103');
        assert.equal(metric.latest.percentWindow.lastSdk, metric.latest.observation.sdkVersion);
        assert.equal(metric.latest.percentWindow.count, 5);
        assert.equal(metric.averageComparison.value, metric.latest.percentWindow.mean);
        assert.equal(metric.hasNewerIncomplete, false);
        assert.equal(metric.ageDays, 1);
    }
});

test('all ten applications keep four slots and truthful partial or cohort states', () => {
    const expected = {
        'havit-bootstrap': ['ready', 'ready', 'ready', 'ready'],
        'blazing-pizza': ['ready', 'ready', 'ready', 'ready'],
        'mud-blazor': ['ready', 'ready', 'ready', 'ready'],
        'igniteui-light': ['ready', 'ready', 'ready', 'ready'],
        'empty-blazor': ['ready', 'unsupported-metric', 'ready', 'ready'],
        'empty-browser': ['ready', 'unsupported-metric', 'ready', 'ready'],
        'blazor-perf': ['ready', 'unsupported-metric', 'ready', 'ready'],
        'micro-benchmarks': ['unsupported-metric', 'unsupported-metric', 'unsupported-metric', 'ready'],
        'semi-avalonia': ['unsupported-cohort', 'unsupported-cohort', 'unsupported-cohort', 'unsupported-cohort'],
        'uno-gallery': ['unsupported-cohort', 'unsupported-cohort', 'unsupported-cohort', 'unsupported-cohort'],
    };
    for (const [app, states] of Object.entries(expected)) {
        const result = report(app);
        assert.equal(result.apps.length, 10);
        assert.deepEqual(result.metrics.map(metric => metric.status), states, app);
        for (const metric of result.metrics.filter(metric => metric.status !== 'ready')) {
            assert.equal(metric.comparison, null);
            assert.equal(metric.averageComparison, null);
            assert(metric.message);
        }
    }
});

test('percentages use Mono as denominator, with finite positive inputs and display-neutral parity', () => {
    near(percentVsMono(112, 100), 12);
    near(percentVsMono(88, 100), -12);
    for (const input of [0, -1, null, NaN, Infinity, -Infinity]) {
        assert.equal(percentVsMono(100, input), null);
        assert.equal(percentVsMono(input, 100), null);
    }
    assert.equal(percentVsMono(Number.MAX_VALUE, Number.MIN_VALUE), null);
    assert.deepEqual(comparisonLabel(12, 'ms'), { value: 12, magnitude: '12.0%', verdict: 'slower', tone: 'worse' });
    assert.equal(comparisonLabel(-12, 'MB').verdict, 'smaller');
    assert.equal(comparisonLabel(12, 'MB').verdict, 'larger');
    assert.equal(comparisonLabel(-12, 's').verdict, 'faster');
    for (const value of [0, -0, 0.001, -0.001]) {
        assert.equal(comparisonLabel(value, 'ms').tone, 'neutral');
        assert.equal(comparisonLabel(value, 'ms').magnitude, '0.0%');
        assert.equal(comparisonLabel(value, 'ms').verdict, 'same');
    }
    assert.throws(() => comparisonLabel(NaN, 's'), /finite/);
});

test('unit conversion is presentation-only, with decimal MB and publish milliseconds to seconds', () => {
    const metrics = focusMetrics('havit-bootstrap');
    assert.equal(formatFocusValue(767, metrics[0]), '767 ms');
    assert.equal(formatFocusValue(22227, metrics[1]), '22.23 s');
    assert.equal(formatFocusValue(4965317, metrics[2]), '4.97 MB');
    assert.equal(formatFocusValue(33811, metrics[3]), '33.81 s');
    assert.equal(formatFocusValue(null, metrics[0]), 'Not available');
});

test('cold startup is explicitly time to managed on desktop, not runtime creation or mobile', () => {
    const definition = focusMetrics('havit-bootstrap')[0];
    assert.equal(definition.key, 'time-to-reach-managed-cold');
    assert.match(definition.description, /Time to managed \(cold\)/);
    const result = report();
    assert.match(result.metrics[0].description, /desktop\/Chromium.*no CPU or network throttling/);
    const fixture = focusFixture();
    const latest = result.metrics[0].latest;
    const source = fixture.buckets.find(bucket => bucket.path === latest.observation.bucket);
    const rows = source.appMetrics['havit-bootstrap'][definition.key];
    assert.equal(latest.mono, rows['mono/no-workload/desktop/chrome'][latest.observation.columnIndex]);
    assert.equal(latest.coreclr, rows['coreclr/no-workload/desktop/chrome'][latest.observation.columnIndex]);
    assert.notEqual(latest.mono, rows['mono/no-workload/mobile/chrome'][latest.observation.columnIndex]);
    assert.notEqual(latest.coreclr, rows['coreclr/no-workload/mobile/chrome'][latest.observation.columnIndex]);
});

test('14 inclusive UTC days and calendar months handle leap years, clamping and offsets', () => {
    assert.deepEqual(historyBounds('14d', now), { startDay: '2026-09-07', endDay: '2026-09-20' });
    for (const [range, end, start] of [
        ['1m', '2024-03-31', '2024-02-29'], ['1m', '2025-03-31', '2025-02-28'],
        ['3m', '2026-05-31', '2026-02-28'], ['6m', '2026-08-31', '2026-02-28'],
        ['12m', '2024-02-29', '2023-02-28'],
    ]) assert.equal(historyBounds(range, new Date(`${end}T23:00:00Z`)).startDay, start);
    assert.equal(historyBounds('14d', new Date('2026-03-29T00:30:00+02:00')).endDay, '2026-03-28');
    assert.throws(() => historyBounds('2m', now), /Unsupported/);
    assert.throws(() => historyBounds('14d', new Date(NaN)), /invalid/);
});

test('multiple same-day SDKs keep distinct ordinal slots; numeric versions sort within the day', () => {
    const points = report().metrics[0].points;
    assert.deepEqual(points.map(point => point.position), Array.from({ length: 23 }, (_, i) => i));
    assert.equal(points.filter(point => point.observation.day === '2026-09-18').length, 4);
    assert.equal(points.filter(point => point.observation.day === '2026-09-09').length, 3);
    const fixture = focusFixture();
    const columns = fixture.buckets[0].header.columns;
    columns[0].sdkVersion = '12.0.100-alpha.1.26459.99';
    columns[1].sdkVersion = '12.0.100-alpha.1.26459.100';
    columns[0].releaseDate = columns[1].releaseDate = '2026-09-09';
    assert(report('havit-bootstrap', '14d', now, fixture).metrics[0].points[0].observation.sdkVersion.endsWith('.99'));
});

test('identity includes full variant, not SDK/runtime hash alone; .NET 11 and custom builds are excluded', () => {
    const fixture = focusFixture();
    const columns = fixture.buckets[0].header.columns;
    columns[1].sdkVersion = columns[0].sdkVersion;
    columns[1].runtimeGitHash = columns[0].runtimeGitHash;
    columns[2].major = 11;
    columns[2].channel = '11.0';
    const points = report('havit-bootstrap', '14d', now, fixture).metrics[0].points;
    assert.equal(points.length, 22);
    const variants = points.filter(point => point.observation.sdkVersion === columns[0].sdkVersion);
    assert.equal(variants.length, 2);
    assert.notEqual(variants[0].observation.id, variants[1].observation.id);
    assert(points.every(point => point.observation.variant.isRuntimeCustomBuild !== true));
    const parsed = parseFocusHeader(fixture.buckets[0].header, 'header');
    assert.equal(parsed.columns[0].isRuntimeCustomBuild, null, 'missing flags remain unknown');
});

test('duplicate full identities are an explicit malformed-publication error', () => {
    const fixture = focusFixture();
    fixture.buckets[0].header.columns[1] = structuredClone(fixture.buckets[0].header.columns[0]);
    assert.throws(() => report('havit-bootstrap', '14d', now, fixture), /Duplicate SDK\/variant/);
});

test('per-metric latest is a same-column pair, not independently newest runtime results', () => {
    const fixture = focusFixture();
    const rows = fixture.buckets[1].appMetrics['havit-bootstrap']['havit-walkthrough'];
    rows['coreclr/no-workload/desktop/chrome'][14] = null;
    rows['mono/no-workload/desktop/chrome'][13] = null;
    const result = report('havit-bootstrap', '14d', now, fixture);
    assert.equal(result.metrics[0].latest.observation.columnIndex, 14);
    assert.equal(result.metrics[1].latest.observation.columnIndex, 12);
    assert.equal(result.metrics[1].hasNewerIncomplete, true);
    assert.equal(result.metrics[1].latest.percentWindow.lastSdk, result.metrics[1].latest.observation.sdkVersion);
    assert.equal(result.metrics[1].points.at(-1).coreclrWindow, null);
    assert(result.metrics[1].points.at(-1).monoWindow);
    assert.equal(result.metrics[1].points.at(-1).percentWindow, null);
});

test('no headline leaks outside the date window and bucket names are not date filters', () => {
    const future = report('havit-bootstrap', '14d', new Date('2027-09-20'));
    for (const metric of future.metrics) {
        assert.equal(metric.status, 'no-history');
        assert.equal(metric.latest, null);
    }
    const fixture = focusFixture();
    fixture.buckets[0].path = '2020-01-06';
    fixture.index.weeks[0] = '2020-01-06';
    assert.equal(report('havit-bootstrap', '14d', now, fixture).metrics[0].pairCount, 23);
});

test('an index with no eligible SDK12 observations is no history, not fabricated older-channel data', () => {
    const fixture = focusFixture();
    for (const bucket of fixture.buckets) {
        for (const column of bucket.header.columns) {
            column.major = 11;
            column.channel = '11.0';
        }
    }
    for (const metric of report('havit-bootstrap', '14d', now, fixture).metrics) {
        assert.equal(metric.status, 'no-history');
        assert.equal(metric.points.length, 0);
        assert.equal(metric.latest, null);
    }
});

test('never substitute another preset, engine, profile, or native-only app cohort', () => {
    const fixture = focusFixture();
    for (const bucket of fixture.buckets) {
        delete bucket.appMetrics['havit-bootstrap']['compile-time']['coreclr/no-workload/desktop/chrome'];
    }
    const build = report('havit-bootstrap', '14d', now, fixture).metrics[3];
    assert.equal(build.status, 'incomplete-pair');
    assert(build.points.every(point => point.coreclr === null && point.percent === null && point.mono > 0));
});

test('invalid baselines are explicit and do not acquire an average caption', () => {
    const fixture = focusFixture();
    for (const bucket of fixture.buckets) {
        bucket.appMetrics['havit-bootstrap']['compile-time']['mono/no-workload/desktop/chrome'].fill(0);
    }
    const build = report('havit-bootstrap', '14d', now, fixture).metrics[3];
    assert.equal(build.status, 'invalid-value');
    assert.equal(build.averageComparison, null);
    assert(build.points.every(point => point.issue.includes('Invalid Mono baseline')));
});

test('rolling windows use short starts, exactly five thereafter, and gap resets without future values', () => {
    const observations = report().metrics[0].points.map(point => point.observation);
    const values = [1, 2, 3, 4, 5, 20, null, 8, 9, NaN, 10];
    const windows = rollingWindows(values, observations.slice(0, values.length));
    assert.deepEqual(windows.slice(0, 6).map(window => window.count), [1, 2, 3, 4, 5, 5]);
    near(windows[5].mean, (2 + 3 + 4 + 5 + 20) / 5);
    assert.equal(windows[5].min, 2);
    assert.equal(windows[5].max, 20);
    assert.equal(windows[6], null);
    assert.equal(windows[7].count, 1);
    assert.equal(windows[7].min, windows[7].max);
    assert.equal(windows[9], null);
    assert.equal(windows[10].count, 1);
    assert.throws(() => rollingWindows([1], []), /observation/);
    assert.throws(() => rollingWindows([], [], 0), /positive integer/);
});

test('rolling comparison averages individual signed percentages, not ratios of means', () => {
    const observations = report().metrics[0].points.slice(0, 2).map(point => point.observation);
    const percent = rollingWindows([percentVsMono(2, 1), percentVsMono(4, 4)], observations)[1];
    near(percent.mean, 50);
    assert.equal(percent.min, 0);
    assert.equal(percent.max, 100);
    near(percentVsMono(3, 2.5), 20);
    const signed = rollingWindows([-20, 10], observations)[1];
    near(signed.mean, -5);
});

test('cropping keeps four-point lookback so overlapping means do not change between ranges', () => {
    const date = new Date('2026-09-26T12:00:00Z');
    const narrow = report('havit-bootstrap', '14d', date).metrics[0];
    const wide = report('havit-bootstrap', '1m', date).metrics[0];
    assert(narrow.points.length < wide.points.length);
    assert.equal(narrow.points[0].percentWindow.count, 5);
    for (const point of narrow.points) {
        const other = wide.points.find(candidate => candidate.observation.id === point.observation.id);
        assert.deepEqual(point.percentWindow, other.percentWindow);
        assert.deepEqual(point.monoWindow, other.monoWindow);
        assert.deepEqual(point.coreclrWindow, other.coreclrWindow);
    }
});

test('chart models retain exactly three primary series, stable domains, gaps and 0% parity', () => {
    const metric = report().metrics[0];
    const before = structuredClone(metric);
    const visibility = { percentage: true, measurements: true };
    const average = focusChartModel(metric, true, true, visibility);
    const raw = focusChartModel(metric, false, true, visibility);
    const noBands = focusChartModel(metric, true, false, visibility);
    assert.equal(average.series.length, 3);
    assert.equal(average.bandOpacity, 0.2);
    assert.equal(raw.bands, false);
    assert.equal(noBands.bands, false);
    assert.equal(average.runtimeMax, raw.runtimeMax);
    assert.equal(average.percentMin, raw.percentMin);
    assert(average.percentMin <= 0 && average.percentMax >= 0);
    assert.deepEqual(metric, before, 'presentation never mutates raw/secondary summaries');
    for (const series of average.series) {
        assert(series.data.every((point, i) => i === 0 || point.x > series.data[i - 1].x));
        for (let i = 0; i < series.data.length; i++) {
            const window = series.windows[i];
            if (!window) continue;
            assert(window.min <= window.mean && window.mean <= window.max);
            assert(window.count >= 1 && window.count <= 5);
        }
    }
    const single = { ...metric, points: [metric.points[0]] };
    assert.equal(focusChartModel(single, true, true).xMin, -0.5);
    assert.equal(focusChartModel(single, true, true).xMax, 0.5);
    assert.equal(single.points[0].percentWindow.min, single.points[0].percentWindow.max);
});

test('band fill alone closes at exactly 20% opacity; boundary strokes have no end caps', () => {
    const fills = [];
    const strokes = [];
    let path = [];
    const context = {
        globalAlpha: 1,
        save() {}, restore() {}, beginPath() { path = []; },
        moveTo(x, y) { path.push(['M', x, y]); }, lineTo(x, y) { path.push(['L', x, y]); },
        closePath() { path.push(['Z']); },
        fill() { fills.push({ path: structuredClone(path), opacity: this.globalAlpha }); },
        stroke() { strokes.push(structuredClone(path)); },
    };
    drawFocusBand(context, [{ x: 0, min: 1, max: 3 }, { x: 1, min: 2, max: 5 }], '#4285f4');
    assert.equal(fills.length, 1);
    assert.equal(fills[0].opacity, 0.2);
    assert.equal(fills[0].path.at(-1)[0], 'Z');
    assert.deepEqual(strokes, [[['M', 0, 1], ['L', 1, 2]], [['M', 0, 3], ['L', 1, 5]]]);
    drawFocusBand(context, [{ x: 0, min: 1, max: 1 }], '#4285f4');
    assert.equal(fills.length, 1, 'a single observation has no fabricated envelope');
});

test('publication validation rejects malformed headers/rows rather than rendering empty success', () => {
    const fixture = focusFixture();
    assert.throws(() => parseFocusIndex({}), /lastUpdated/);
    const invalidHeader = structuredClone(fixture.buckets[0].header);
    invalidHeader.columns[0].releaseDate = '2026-02-30';
    assert.throws(() => parseFocusHeader(invalidHeader, 'header'), /calendar day/);
    assert.throws(() => parseFocusRows({}, 1, 'metric'), /no rows/);
    assert.throws(() => parseFocusRows({ 'mono/no-workload/desktop/chrome': [1] }, 2, 'metric'), /columns/);
    assert.throws(() => parseFocusRows({ 'mono/no-workload/desktop/chrome': ['1'] }, 1, 'metric'), /nonnumeric/);
    assert.throws(() => parseFocusRows({ wrong: [1] }, 1, 'metric'), /identity/);
    assert.throws(() => parseFocusIndex({ ...fixture.index, apps: ['../unsafe'] }), /segment/);
});
