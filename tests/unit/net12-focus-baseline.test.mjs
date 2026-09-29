import assert from 'node:assert/strict';
import { test } from 'node:test';
import { focusFixture, publicationFor } from '../helpers/focus-fixture.mjs';
import { buildFocusReport } from '../../src/bench-viewer/wwwroot/chart/focus-data.js';
import { focusChartModel } from '../../src/bench-viewer/wwwroot/chart/focus-chart.js';

const app = 'semi-avalonia';
const now = new Date('2026-09-20T12:00:00Z');
const report = (publication, flavor = 'release-release', startupProfile = 'mobile', range = '14d', date = now) =>
    buildFocusReport(publication, app, range, date, { flavor, startupProfile });

function removeRows(publication, matches) {
    for (const bucket of publication.buckets) {
        for (const rows of Object.values(bucket.metrics)) {
            for (const key of Object.keys(rows)) if (matches(key)) delete rows[key];
        }
    }
}

test('native baseline labels and row metadata are effective across all flavors and startup profiles', () => {
    const publication = publicationFor(app);
    for (const flavor of ['release-release', 'r2r-release', 'r2r-aot']) {
        for (const profile of ['desktop', 'mobile']) {
            const result = report(publication, flavor, profile);
            assert.equal(result.cohort.baselinePreset, 'native-relink');
            assert.equal(result.cohort.usesBaseline, flavor !== 'r2r-aot');
            const coreclr = flavor === 'release-release' ? 'native-relink' : 'aot';
            const mono = flavor === 'r2r-aot' ? 'aot' : 'native-relink';
            const labels = [
                coreclr === 'aot' ? 'CoreCLR publish/R2R' : 'CoreCLR publish (native-relink)',
                mono === 'aot' ? 'Mono publish/AOT' : 'Mono publish (native-relink)',
            ];
            for (const metric of result.metrics) {
                const effectiveProfile = metric.id === 'startup' ? profile : 'desktop';
                assert.equal(metric.coreclrRowKey, `coreclr/${coreclr}/${effectiveProfile}/chrome`);
                assert.equal(metric.monoRowKey, `mono/${mono}/${effectiveProfile}/chrome`);
                assert.deepEqual([metric.coreclrLabel, metric.monoLabel], labels);
                assert.equal(metric.status, 'ready');
                assert(metric.description.includes(result.cohort.baselineDescription));
                assert.deepEqual(focusChartModel(metric, false, false).series.map(series => series.label), labels);
            }
        }
    }
    const mobile = report(publication);
    const desktop = report(publication, 'release-release', 'desktop');
    assert.deepEqual(mobile.metrics.slice(1), desktop.metrics.slice(1));
    assert.equal(mobile.metrics[0].latest.coreclr, 142090);
    assert.equal(mobile.metrics[0].latest.mono, 26031);
    assert.equal(desktop.metrics[0].latest.coreclr, 64010);
    assert.equal(desktop.metrics[0].latest.mono, 6939);
});

for (const row of ['mono/no-workload/desktop/firefox', 'coreclr/no-workload/mobile/chrome']) {
    for (const value of [null, 123]) {
        test(`${row} with ${value} values retains no-workload app-wide, even outside the date window`, () => {
            const publication = publicationFor(app);
            const bucket = publication.buckets[0];
            bucket.metrics['compile-time'][row] = bucket.header.columns.map(() => value);
            const date = new Date('2026-09-26T12:00:00Z');
            for (const range of ['14d', '1m']) {
                for (const flavor of ['release-release', 'r2r-release', 'r2r-aot']) {
                    for (const profile of ['mobile', 'desktop']) {
                        const result = report(publication, flavor, profile, range, date);
                        assert.equal(result.cohort.baselinePreset, 'no-workload');
                        for (const metric of result.metrics) {
                            assert.equal(metric.coreclrPreset, flavor === 'release-release' ? 'no-workload' : 'aot');
                            assert.equal(metric.monoPreset, flavor === 'r2r-aot' ? 'aot' : 'no-workload');
                            assert(!metric.coreclrLabel.includes('native-relink'));
                            assert(!metric.monoLabel.includes('native-relink'));
                            if (flavor === 'r2r-aot') {
                                assert.equal(metric.status, 'ready');
                            } else {
                                assert.equal(metric.latest, null);
                                assert(metric.points.every(point => point.percent === null));
                                assert(metric.points.every(point => point.mono === null));
                                if (flavor === 'release-release') assert(metric.points.every(point => point.coreclr === null));
                            }
                        }
                    }
                }
            }
        });
    }
}

test('no-workload holes and a missing individual metric row never acquire native values', () => {
    const fixture = focusFixture();
    const publication = publicationFor('havit-bootstrap', fixture);
    for (const bucket of publication.buckets) {
        for (const rows of Object.values(bucket.metrics)) {
            for (const [key, values] of Object.entries(rows)) {
                if (key.includes('/no-workload/')) rows[key.replace('/no-workload/', '/native-relink/')] = values.map(() => 999999);
            }
        }
        delete bucket.metrics['compile-time']['coreclr/no-workload/desktop/chrome'];
    }
    const rows = publication.buckets[1].metrics['time-to-reach-managed-cold'];
    rows['coreclr/no-workload/mobile/chrome'][14] = null;
    rows['mono/no-workload/mobile/chrome'][13] = null;
    const result = buildFocusReport(publication, 'havit-bootstrap', '14d', now, { flavor: 'release-release', startupProfile: 'mobile' });
    assert.equal(result.cohort.baselinePreset, 'no-workload');
    const startup = result.metrics[0];
    assert.equal(startup.latest.observation.columnIndex, 12);
    assert.equal(startup.hasNewerIncomplete, true);
    assert.equal(startup.points.at(-1).coreclr, null);
    assert.equal(startup.points.at(-1).percentWindow, null);
    assert.equal(startup.points.at(-2).mono, null);
    assert.equal(result.metrics[3].status, 'incomplete-pair');
    assert(result.metrics[3].points.every(point => point.coreclr === null));
});

test('neither baseline preset means unavailable publish slots, not an AOT substitute', () => {
    const publication = publicationFor(app);
    removeRows(publication, key => key.includes('/native-relink/'));
    for (const flavor of ['release-release', 'r2r-release']) {
        const result = report(publication, flavor);
        assert.equal(result.cohort.baselinePreset, null);
        assert.match(result.cohort.baselineDescription, /neither no-workload nor native-relink/);
        assert(result.metrics.every(metric => metric.latest === null));
        assert(result.metrics.every(metric => metric.points.every(point => point.mono === null)));
    }
    const aot = report(publication, 'r2r-aot');
    assert.equal(aot.cohort.usesBaseline, false);
    assert(aot.metrics.every(metric => metric.status === 'ready'));
    assert(aot.metrics.every(metric => metric.coreclrPreset === 'aot' && metric.monoPreset === 'aot'));
});

test('one native runtime stays one-sided; explicit R2R and Mono AOT never borrow native rows', () => {
    for (const preset of ['native-relink', 'aot']) {
        const publication = publicationFor(app);
        removeRows(publication, key => key.startsWith(`coreclr/${preset}/`));
        const result = report(publication, preset === 'aot' ? 'r2r-release' : 'release-release');
        assert.equal(result.cohort.baselinePreset, 'native-relink');
        for (const metric of result.metrics) {
            assert.equal(metric.status, 'incomplete-pair');
            assert.equal(metric.latest, null);
            assert.match(metric.message, /CoreCLR .* measurements are missing/);
            assert(metric.points.every(point => point.coreclr === null && point.percent === null));
            assert(metric.points.some(point => point.mono > 0));
        }
    }
    const publication = publicationFor(app);
    removeRows(publication, key => key.startsWith('mono/aot/'));
    const result = report(publication, 'r2r-aot');
    assert(result.metrics.every(metric => metric.status === 'incomplete-pair' && metric.latest === null));
    assert(result.metrics.every(metric => metric.points.every(point => point.mono === null)));
});

test('missing native mobile or Chromium rows never borrow desktop or Firefox measurements', () => {
    const publication = publicationFor(app);
    removeRows(publication, key => key.includes('/native-relink/mobile/'));
    for (const flavor of ['release-release', 'r2r-release']) {
        const mobile = report(publication, flavor);
        assert.equal(mobile.cohort.baselinePreset, 'native-relink');
        assert.equal(mobile.metrics[0].latest, null);
        assert(mobile.metrics.slice(1).every(metric => metric.status === 'ready'));
        assert(report(publication, flavor, 'desktop').metrics.every(metric => metric.status === 'ready'));
    }
    removeRows(publication, key => key.includes('/native-relink/') && key.endsWith('/chrome'));
    const firefoxOnly = report(publication, 'release-release', 'desktop');
    assert.equal(firefoxOnly.cohort.baselinePreset, 'native-relink');
    assert(firefoxOnly.metrics.every(metric => metric.status === 'unsupported-cohort'));
    assert(firefoxOnly.metrics.every(metric => metric.points.every(point => point.coreclr === null && point.mono === null)));
});

test('Uno shows its native Mono observations but never a fabricated CoreCLR comparison', () => {
    for (const flavor of ['release-release', 'r2r-release', 'r2r-aot']) {
        const result = buildFocusReport(publicationFor('uno-gallery'), 'uno-gallery', '14d', now, { flavor, startupProfile: 'mobile' });
        assert.equal(result.cohort.baselinePreset, 'native-relink');
        for (const metric of result.metrics) {
            assert.equal(metric.latest, null);
            assert.equal(metric.comparison, null);
            assert.equal(metric.averageComparison, null);
            assert(metric.points.every(point => point.coreclr === null));
            if (flavor !== 'r2r-aot') {
                assert.equal(metric.status, 'incomplete-pair');
                assert(metric.points.some(point => point.mono > 0));
                assert.match(metric.message, /CoreCLR .* measurements are missing/);
            } else {
                assert.equal(metric.status, 'unsupported-cohort');
                assert(metric.points.every(point => point.mono === null));
            }
        }
    }
});

test('ineligible-only buckets cannot change the SDK12 app baseline', () => {
    const publication = publicationFor(app);
    const custom = structuredClone(publication.buckets[0]);
    custom.path = 'custom-only';
    custom.header.columns.forEach(column => { column.isRuntimeCustomBuild = true; });
    custom.metrics['compile-time']['mono/no-workload/mobile/chrome'] = custom.header.columns.map(() => 1);
    publication.buckets.push(custom);
    assert.equal(report(publication).cohort.baselinePreset, 'native-relink');
});
