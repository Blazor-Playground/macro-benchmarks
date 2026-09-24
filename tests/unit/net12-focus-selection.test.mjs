import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expectedComparison, focusFixture, publicationFor } from '../helpers/focus-fixture.mjs';
import { buildFocusReport } from '../../src/bench-viewer/wwwroot/chart/focus-data.js';
import { DEFAULT_FOCUS_SELECTION, FOCUS_FLAVORS, focusConfiguration } from '../../src/bench-viewer/wwwroot/chart/focus-selection.js';
import { FocusSession } from '../../src/bench-viewer/wwwroot/chart/focus-interop.js';

const now = () => new Date('2026-09-20T12:00:00Z');
const near = (a, b) => assert(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('defaults and the three permitted runtime/preset mappings have one central definition', () => {
    assert.deepEqual(DEFAULT_FOCUS_SELECTION, { flavor: 'r2r-release', startupProfile: 'mobile' });
    assert.deepEqual(FOCUS_FLAVORS.map(f => [f.id, f.label, f.coreclrPreset, f.monoPreset]), [
        ['release-release', 'Release vs Release', 'no-workload', 'no-workload'],
        ['r2r-release', 'Release/R2R vs Release', 'aot', 'no-workload'],
        ['r2r-aot', 'Release/R2R vs Release/AOT', 'aot', 'aot'],
    ]);
    assert.equal(focusConfiguration().defaultFlavor, DEFAULT_FOCUS_SELECTION.flavor);
    const result = buildFocusReport(publicationFor('havit-bootstrap'), 'havit-bootstrap', '14d', now());
    assert.equal(result.flavor, 'r2r-release');
    assert.equal(result.startupProfile, 'mobile');
    assert.deepEqual(result.metrics.map(metric => metric.comparison.magnitude), ['119.3%', '77.7%', '133.4%', '371.3%']);
    assert.deepEqual(result.metrics.map(metric => metric.averageComparison.magnitude), ['96.6%', '26.3%', '133.3%', '368.6%']);
    assert.deepEqual(result.metrics.map(metric => metric.profile), ['mobile', 'desktop', 'desktop', 'desktop']);
});

for (const flavor of ['release-release', 'r2r-release', 'r2r-aot']) {
    for (const startupProfile of ['desktop', 'mobile']) {
        test(`${flavor}/${startupProfile}: every app uses exact source rows, same-column pairs and per-point averages`, () => {
            const fixture = focusFixture();
            for (const app of fixture.index.apps) {
                const report = buildFocusReport(publicationFor(app, fixture), app, '14d', now(), { flavor, startupProfile });
                const expected = expectedComparison(app, flavor, startupProfile, fixture);
                report.metrics.forEach((metric, index) => {
                    const source = expected[index];
                    assert.equal(metric.coreclrRowKey, source.coreclrRow);
                    assert.equal(metric.monoRowKey, source.monoRow);
                    assert.equal(metric.profile, source.profile);
                    assert.equal(metric.points.length, source.points.length);
                    metric.points.forEach((point, i) => {
                        assert.equal(point.coreclr, source.points[i].coreclr);
                        assert.equal(point.mono, source.points[i].mono);
                        assert.equal(point.observation.bucket, source.points[i].bucket);
                        assert.equal(point.observation.columnIndex, source.points[i].columnIndex);
                        if (source.points[i].percent === null) {
                            assert.equal(point.percent, null);
                            assert.equal(point.percentWindow, null);
                        } else {
                            near(point.percent, source.points[i].percent);
                            near(point.percentWindow.mean, source.points[i].average);
                            assert.equal(point.percentWindow.count, source.points[i].count);
                        }
                    });
                    if (source.latest) {
                        near(metric.comparison.value, source.latest.percent);
                        near(metric.averageComparison.value, source.latest.average);
                        assert.equal(metric.latest.observation.variant.vmrGitHash, source.latest.vmr);
                    } else {
                        assert.equal(metric.latest, null);
                        assert.equal(metric.averageComparison, null);
                        assert.notEqual(metric.status, 'ready');
                    }
                });
            }
        });
    }
}

test('mobile changes startup only; unavailable R2R rows stay gaps even when Release rows exist', () => {
    const publication = publicationFor('havit-bootstrap');
    const desktop = buildFocusReport(publication, 'havit-bootstrap', '14d', now(), { flavor: 'r2r-release', startupProfile: 'desktop' });
    const mobile = buildFocusReport(publication, 'havit-bootstrap', '14d', now(), { flavor: 'r2r-release', startupProfile: 'mobile' });
    assert.notEqual(desktop.metrics[0].latest.coreclr, mobile.metrics[0].latest.coreclr);
    assert.deepEqual(desktop.metrics.slice(1), mobile.metrics.slice(1));
    assert.equal(mobile.metrics[0].points[0].coreclr, null);
    assert(mobile.metrics[0].points[0].mono > 0);
    assert.equal(mobile.metrics[0].points[0].percentWindow, null);
    const firstPair = mobile.metrics[0].points.find(point => point.percent !== null);
    assert.equal(firstPair.percentWindow.count, 1);
    assert.equal(mobile.metrics[0].pairCount, 6);
});

test('missing selected-profile or R2R data never falls back to desktop, interpreter or native-relink', () => {
    const fixture = focusFixture();
    for (const bucket of fixture.buckets) {
        delete bucket.appMetrics['havit-bootstrap']['time-to-reach-managed-cold']['coreclr/aot/mobile/chrome'];
    }
    const report = buildFocusReport(publicationFor('havit-bootstrap', fixture), 'havit-bootstrap', '14d', now());
    assert.equal(report.metrics[0].status, 'incomplete-pair');
    assert.equal(report.metrics[0].latest, null);
    assert(report.metrics[0].points.every(point => point.coreclr === null));
    assert(report.metrics.slice(1).every(metric => metric.status === 'ready'));
    for (const selection of [{ flavor: 'release-aot', startupProfile: 'mobile' }, { flavor: 'r2r-release', startupProfile: 'firefox' }]) {
        assert.throws(() => buildFocusReport(publicationFor('havit-bootstrap'), 'havit-bootstrap', '14d', now(), selection), /Unsupported/);
    }
});

test('local flavor/profile/range choices reuse all-row publication data; refresh deliberately reloads', async () => {
    let loads = 0;
    const session = new FocusSession({ async load(app) { loads++; return publicationFor(app); } }, { dispose() {}, render() {} }, now);
    for (const flavor of FOCUS_FLAVORS) {
        for (const startupProfile of ['desktop', 'mobile']) {
            const result = JSON.parse(await session.load('havit-bootstrap', '14d', false, { flavor: flavor.id, startupProfile }));
            assert.equal(result.report.flavor, flavor.id);
            assert.equal(result.report.startupProfile, startupProfile);
        }
    }
    assert.equal(loads, 1);
    await session.load('havit-bootstrap', '1m');
    assert.equal(loads, 1);
    await session.load('havit-bootstrap', '1m', true);
    assert.equal(loads, 2);
});

test('a late old flavor/profile load cannot replace a newer same-app selection', async () => {
    const pending = [];
    const renders = [];
    const session = new FocusSession({ load() { return new Promise(resolve => pending.push(resolve)); } },
        { dispose() {}, render(_owner, report) { renders.push([report.flavor, report.startupProfile]); } }, now);
    const old = session.load('havit-bootstrap', '14d', false, { flavor: 'release-release', startupProfile: 'desktop' });
    const current = session.load('havit-bootstrap', '14d', false, { flavor: 'r2r-aot', startupProfile: 'mobile' });
    pending[1](publicationFor('havit-bootstrap'));
    assert.equal(JSON.parse(await current).report.flavor, 'r2r-aot');
    pending[0](publicationFor('havit-bootstrap'));
    assert.equal(JSON.parse(await old).status, 'cancelled');
    session.render('owner', true, true);
    assert.deepEqual(renders, [['r2r-aot', 'mobile']]);
    session.dispose();
});

test('a failed forced refresh does not make a later local choice silently reuse an older publication', async () => {
    let fail = false;
    const session = new FocusSession({ async load(app) { if (fail) throw new Error('publication unavailable'); return publicationFor(app); } },
        { dispose() {}, render() {} }, now);
    await session.load('havit-bootstrap', '14d');
    fail = true;
    await assert.rejects(session.load('havit-bootstrap', '14d', true), /unavailable/);
    await assert.rejects(session.load('havit-bootstrap', '14d', false, { flavor: 'release-release', startupProfile: 'desktop' }), /unavailable/);
});
