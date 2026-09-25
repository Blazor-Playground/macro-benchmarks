import assert from 'node:assert/strict';
import { test } from 'node:test';
import { focusFixture, fixtureResources, publicationFor } from '../helpers/focus-fixture.mjs';
import { FocusLoader } from '../../src/bench-viewer/wwwroot/chart/focus-loader.js';
import { FocusSession } from '../../src/bench-viewer/wwwroot/chart/focus-interop.js';

const root = new URL('http://localhost/macro-benchmarks/data/views/');
function server(resources = fixtureResources(), override) {
    const requests = [];
    const request = async (url, options) => {
        const key = new URL(url).pathname.split('/data/views/')[1];
        requests.push(key);
        options.signal.throwIfAborted();
        const replacement = await override?.(key, requests);
        if (replacement) return replacement;
        return resources.has(key) ? Response.json(resources.get(key)) : new Response('Missing', { status: 404 });
    };
    return { requests, request };
}
const signal = () => new AbortController().signal;

test('native fetch is invoked with its browser receiver, not the loader instance', async () => {
    const original = globalThis.fetch;
    const http = server();
    globalThis.fetch = function (url, options) {
        assert.equal(this, globalThis);
        return http.request(url, options);
    };
    try {
        await new FocusLoader(root).load('havit-bootstrap', signal());
    } finally {
        globalThis.fetch = original;
    }
});

test('loader fetches headers regardless of bucket names and only four selected-app metrics', async () => {
    const http = server();
    const loader = new FocusLoader(root, http.request);
    const data = await loader.load('havit-bootstrap', signal());
    assert.equal(data.buckets.length, 2);
    assert.equal(http.requests.filter(key => key === 'index.json').length, 2);
    const metrics = http.requests.filter(key => key.includes('havit-bootstrap'));
    assert.equal(metrics.length, 8);
    assert(metrics.every(key => /_(time-to-reach-managed-cold|havit-walkthrough|download-size-cold|compile-time)\.json$/.test(key)));
    assert.equal(data.buckets[0].header.columns[0].isRuntimeCustomBuild, null);
});

test('publication-scoped caching, forced refresh, and independent data roots', async () => {
    const http = server();
    const loader = new FocusLoader(root, http.request);
    await loader.load('havit-bootstrap', signal());
    const first = http.requests.length;
    await loader.load('havit-bootstrap', signal());
    assert.equal(http.requests.length - first, 2, 'only publication revalidation is repeated');
    await loader.load('havit-bootstrap', signal(), true);
    assert.equal(http.requests.filter(key => key.endsWith('havit-bootstrap_compile-time.json')).length, 4);
    const otherHttp = server();
    await new FocusLoader(new URL('http://localhost/other/data/views/'), otherHttp.request).load('havit-bootstrap', signal());
    assert.equal(otherHttp.requests.length, first);
});

for (const status of [404, 500]) {
    test(`advertised metric HTTP ${status} is a visible bounded error, not missing data`, async () => {
        const http = server(undefined, key => key.endsWith('havit-bootstrap_compile-time.json') ? new Response('failed', { status }) : undefined);
        await assert.rejects(new FocusLoader(root, http.request).load('havit-bootstrap', signal()), new RegExp(`HTTP ${status}`));
        assert.equal(http.requests.filter(key => key === 'index.json').length, 4);
    });
}

test('invalid JSON and persistent array mismatch are rejected after at most two attempts', async () => {
    const broken = server(undefined, key => key.endsWith('header.json') ? new Response('{') : undefined);
    await assert.rejects(new FocusLoader(root, broken.request).load('havit-bootstrap', signal()), /invalid JSON/);
    const resources = fixtureResources();
    resources.set('2026-09-14/havit-bootstrap_compile-time.json', { 'mono/no-workload/desktop/chrome': [1] });
    await assert.rejects(new FocusLoader(root, server(resources).request).load('havit-bootstrap', signal()), /15 columns/);
});

test('offline is reported explicitly and cancellation is not mislabeled as a network error', async () => {
    const loader = new FocusLoader(root, async () => { throw new TypeError('offline'); });
    await assert.rejects(loader.load('havit-bootstrap', signal()), /Check the connection/);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(new FocusLoader(root, server().request).load('havit-bootstrap', controller.signal), { name: 'AbortError' });
});

test('an observed publication change invalidates resources and retries once with the new marker', async () => {
    const resources = fixtureResources();
    let reads = 0;
    const http = server(resources, key => {
        if (key !== 'index.json') return;
        reads++;
        return Response.json({ ...resources.get(key), lastUpdated: reads === 1 ? '2026-09-19T00:00:00Z' : '2026-09-20T00:00:00Z' });
    });
    const result = await new FocusLoader(root, http.request).load('havit-bootstrap', signal());
    assert.equal(reads, 4);
    assert.equal(result.index.lastUpdated, '2026-09-20T00:00:00Z');
    assert.equal(http.requests.filter(key => key === '2026-09-14/header.json').length, 2);
});

test('a publication changing in both attempts produces an explicit inconsistency error', async () => {
    const resources = fixtureResources();
    let reads = 0;
    const http = server(resources, key => key === 'index.json'
        ? Response.json({ ...resources.get(key), lastUpdated: `2026-09-20T00:00:0${++reads}Z` }) : undefined);
    await assert.rejects(new FocusLoader(root, http.request).load('havit-bootstrap', signal()), /changed repeatedly/);
    assert.equal(reads, 4);
});

test('late resources from a failed attempt cannot repopulate the replacement cache', async () => {
    const resources = fixtureResources();
    const counts = new Map();
    let finishOld;
    const http = server(resources, key => {
        counts.set(key, (counts.get(key) ?? 0) + 1);
        if (key === '2026-09-07/header.json' && counts.get(key) === 1) return new Response('', { status: 500 });
        if (key !== '2026-09-14/header.json') return;
        const header = structuredClone(resources.get(key));
        if (counts.get(key) === 1) {
            header.columns[14].runtimePackVersion = 'stale-attempt';
            return new Promise(resolve => { finishOld = () => resolve(Response.json(header)); });
        }
        header.columns[14].runtimePackVersion = 'current-attempt';
        return Response.json(header);
    });
    const loader = new FocusLoader(root, http.request);
    const current = await loader.load('havit-bootstrap', signal());
    assert.equal(current.buckets[1].header.columns[14].runtimePackVersion, 'current-attempt');
    finishOld();
    await new Promise(resolve => setImmediate(resolve));
    const cached = await loader.load('havit-bootstrap', signal());
    assert.equal(cached.buckets[1].header.columns[14].runtimePackVersion, 'current-attempt');
});

test('old selection completion cannot overwrite a newer report even if a transport ignores abort', async () => {
    const pending = new Map();
    const painted = [];
    const session = new FocusSession({
        load(app) { return new Promise(resolve => pending.set(app, resolve)); },
    }, { dispose() {}, render(owner, report) { painted.push(report.app); } }, () => new Date('2026-09-20'));
    const older = session.load('havit-bootstrap', '14d');
    const newer = session.load('empty-blazor', '1m');
    pending.get('empty-blazor')(publicationFor('empty-blazor'));
    assert.equal(JSON.parse(await newer).report.app, 'empty-blazor');
    pending.get('havit-bootstrap')(publicationFor('havit-bootstrap'));
    assert.equal(JSON.parse(await older).status, 'cancelled');
    session.render('test', true, true);
    assert.deepEqual(painted, ['empty-blazor']);
});

test('graph toggles do not refetch or alter either summary; owner disposal prevents late rendering', async () => {
    let loads = 0;
    let disposeCount = 0;
    const renders = [];
    const session = new FocusSession({
        async load(app) { loads++; return publicationFor(app); },
    }, { dispose() { disposeCount++; }, render(owner, report, averaged, bands) {
        renders.push({ owner, summary: structuredClone(report.metrics[0].averageComparison), latest: report.metrics[0].latest, averaged, bands });
    } }, () => new Date('2026-09-20'));
    await session.load('havit-bootstrap', '14d');
    session.render('a', true, true);
    session.render('a', false, true);
    session.render('a', true, false);
    assert.equal(loads, 1);
    assert.deepEqual(renders[0].summary, renders[1].summary);
    assert.deepEqual(renders[0].latest, renders[2].latest);
    session.dispose();
    assert.equal(disposeCount, 2);
    assert.throws(() => session.render('a', true, true), /no current report/);
    await assert.rejects(session.load('havit-bootstrap', '14d'), /disposed/);
});

test('disposal aborts in-flight selection and separate owners retain their own report', async () => {
    let finish;
    const cancelled = new FocusSession({ load() { return new Promise(resolve => { finish = resolve; }); } },
        { dispose() {}, render() { assert.fail('disposed owner rendered'); } });
    const running = cancelled.load('havit-bootstrap', '14d');
    const another = new FocusSession({ async load(app) { return publicationFor(app); } },
        { dispose() {}, render() {} }, () => new Date('2026-09-20'));
    await another.load('empty-browser', '14d');
    cancelled.dispose();
    finish(publicationFor('havit-bootstrap'));
    assert.equal(JSON.parse(await running).status, 'cancelled');
    assert.doesNotThrow(() => another.render('other', true, true));
});

test('a render failure disposes partially created focus charts and preserves the original error', async () => {
    const failure = new Error('Second canvas context unavailable');
    let activeCharts = 0;
    const session = new FocusSession({ async load(app) { return publicationFor(app); } }, {
        dispose() { activeCharts = 0; },
        render() { activeCharts = 1; throw failure; },
    }, () => new Date('2026-09-20'));
    await session.load('havit-bootstrap', '14d');
    assert.throws(() => session.render('owner', false, true), error => error === failure);
    assert.equal(activeCharts, 0);
});
