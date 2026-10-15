import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { NoSavedComparisonError } from '../../bench/local-results.mjs';
import { readLocalDebugFile, startViewerDataProxy } from '../helpers/viewer-data-proxy.mjs';

async function serve(t, handler) {
    const server = createServer(handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
    return { server, port: server.address().port };
}

async function setup(t, liveHandler) {
    let staticRequests = 0;
    const local = await serve(t, (request, response) => {
        staticRequests++;
        response.writeHead(request.headers['if-none-match'] === 'fixture-static' ? 304 : 200, {
            'Content-Type': 'text/html', 'Cross-Origin-Opener-Policy': 'same-origin',
            ETag: 'fixture-static', 'Cache-Control': 'max-age=600',
        });
        response.end('local viewer assets, not live data');
    });
    const live = await serve(t, liveHandler);
    const errors = [];
    const dataUrl = `http://127.0.0.1:${live.port}/published/data/views/`;
    const proxy = await startViewerDataProxy(local.port, dataUrl, 0, message => errors.push(message));
    t.after(() => proxy.close());
    return { base: `http://127.0.0.1:${proxy.port}`, dataUrl, errors, staticRequests: () => staticRequests };
}

test('explicit live mode fetches changing published data without local caching or credential forwarding', async t => {
    let revision = 1;
    const requests = [];
    const service = await setup(t, (request, response) => {
        requests.push({ url: request.url, headers: request.headers });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ revision }));
    });
    const endpoint = `${service.base}/macro-benchmarks/data/views/index.json`;
    const first = await fetch(endpoint, { headers: { Authorization: 'test-only', Cookie: 'test-only=value' } });
    assert.deepEqual(await first.json(), { revision: 1 });
    assert.equal(first.headers.get('cache-control'), 'no-store');
    assert.equal(first.headers.get('x-viewer-data-source'), service.dataUrl);
    revision = 2;
    assert.deepEqual(await (await fetch(endpoint)).json(), { revision: 2 });
    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, '/published/data/views/index.json');
    assert.equal(requests[0].headers.authorization, undefined);
    assert.equal(requests[0].headers.cookie, undefined);
    assert.equal(service.staticRequests(), 0);
    assert.deepEqual(service.errors, []);
});

test('upstream errors remain errors and never fall back to the local snapshot', async t => {
    let status = 404;
    const service = await setup(t, (_request, response) => {
        response.writeHead(status, { 'Content-Type': 'text/plain' });
        response.end('published data unavailable');
    });
    for (const expected of [404, 500]) {
        status = expected;
        const response = await fetch(`${service.base}/macro-benchmarks/data/views/week/header.json`);
        assert.equal(response.status, expected);
        assert.equal(await response.text(), 'published data unavailable');
        assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    assert.equal(service.staticRequests(), 0);
});

test('upstream connection failures are logged and reported as 502, not a successful empty view', async t => {
    const service = await setup(t, request => request.socket.destroy());
    const response = await fetch(`${service.base}/macro-benchmarks/data/views/index.json`);
    assert.equal(response.status, 502);
    assert.match(await response.text(), /No local snapshot was substituted/);
    assert.equal(service.errors.length, 1);
    assert.equal(service.staticRequests(), 0);
});

test('static viewer navigation and headers stay local while invalid data requests are rejected', async t => {
    const service = await setup(t, () => assert.fail('Unexpected live request'));
    const page = await fetch(`${service.base}/macro-benchmarks/net12-focus`);
    assert.equal(page.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.equal(page.headers.get('etag'), null);
    assert.equal(await page.text(), 'local viewer assets, not live data');
    assert.equal(service.staticRequests(), 1);
    const reloaded = await fetch(`${service.base}/macro-benchmarks/net12-focus`, { headers: { 'If-None-Match': 'fixture-static' } });
    assert.equal(reloaded.status, 200, 'an old preview ETag must not keep pre-publish assets alive');
    assert.equal(await reloaded.text(), 'local viewer assets, not live data');
    assert.equal((await fetch(`${service.base}/macro-benchmarks/data/views/index.json`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${service.base}/macro-benchmarks/data/views//unrelated.json`)).status, 400);
    assert.equal((await fetch(`${service.base}/macro-benchmarks/data/views/private.txt`)).status, 400);
    await assert.rejects(startViewerDataProxy(1, 'file:///data/'), /HTTP/);
    await assert.rejects(startViewerDataProxy(1, 'https://user:secret@example.invalid/data/'), /without credentials/);
});

test('local comparison is loaded on every request and never uses an independent copied bundle', async t => {
    const local = await serve(t, (_request, response) => { response.end('stale copied viewer data'); });
    let current = { comparisonPath: '/saved/first/comparison.json', after: { cold: 5000 } };
    const errors = [];
    let failure;
    const proxy = await startViewerDataProxy(local.port, undefined, 0, message => errors.push(message), () => {
        if (failure) throw failure;
        return current;
    });
    t.after(() => proxy.close());
    const endpoint = `http://127.0.0.1:${proxy.port}/macro-benchmarks/data/local-runtime-comparison.json`;
    let response = await fetch(endpoint);
    assert.deepEqual(await response.json(), current);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-viewer-data-source'), current.comparisonPath);
    current = { comparisonPath: '/saved/second/comparison.json', after: { cold: 4663 } };
    response = await fetch(endpoint);
    assert.deepEqual(await response.json(), current);
    failure = new Error('Changed measurement hash');
    response = await fetch(endpoint);
    assert.equal(response.status, 500);
    assert.match(await response.text(), /Changed measurement hash.*No copied snapshot was substituted/);
    assert.equal(errors.length, 1);
});

test('absent local comparisons are discoverable as 404, but broken saved evidence remains an error', async t => {
    const local = await serve(t, () => assert.fail('No static fallback'));
    let failure = new NoSavedComparisonError('No saved result');
    const errors = [];
    const proxy = await startViewerDataProxy(local.port, undefined, 0, message => errors.push(message),
        () => { throw failure; });
    t.after(() => proxy.close());
    const endpoint = `http://127.0.0.1:${proxy.port}/macro-benchmarks/data/local-runtime-comparison.json`;
    assert.equal((await fetch(endpoint, { method: 'HEAD' })).status, 404);
    assert.equal(errors.length, 0);
    failure = Object.assign(new Error('Missing referenced result'), { code: 'ENOENT' });
    assert.equal((await fetch(endpoint, { method: 'HEAD' })).status, 500);
    assert.equal(errors.length, 1);
});

test('local Debug files are independent of published data, update live and never fall back', async t => {
    const directory = await mkdtemp(join(tmpdir(), 'local-debug-views-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const local = await serve(t, () => assert.fail('No static fallback'));
    const remote = await serve(t, (_request, response) => response.end('{"source":"published"}'));
    const errors = [];
    const proxy = await startViewerDataProxy(local.port, `http://127.0.0.1:${remote.port}/published/`, 0,
        message => errors.push(message), undefined, path => readLocalDebugFile(directory, path));
    t.after(() => proxy.close());
    const root = `http://127.0.0.1:${proxy.port}/macro-benchmarks/data/`;
    assert.equal((await fetch(`${root}local-debug/index.json`, { method: 'HEAD' })).status, 404);
    await writeFile(join(directory, 'index.json'), '{"source":"local-one"}');
    let response = await fetch(`${root}local-debug/index.json`, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-viewer-data-source'), join(directory, 'index.json'));
    assert.deepEqual(await (await fetch(`${root}local-debug/index.json`)).json(), { source: 'local-one' });
    await writeFile(join(directory, 'index.json'), '{"source":"local-two"}');
    assert.deepEqual(await (await fetch(`${root}local-debug/index.json`)).json(), { source: 'local-two' });
    assert.deepEqual(await (await fetch(`${root}views/debug/index.json`)).json(), { source: 'published' });
    const generation = 'a'.repeat(64);
    await mkdir(join(directory, 'generations', generation), { recursive: true });
    await writeFile(join(directory, 'generations', generation, 'havit-bootstrap.json'), '{"batches":[]}');
    assert.equal((await fetch(`${root}local-debug/generations/${generation}/havit-bootstrap.json`)).status, 200);
    assert.equal((await fetch(`${root}local-debug/private.txt`)).status, 400);
    await assert.rejects(readLocalDebugFile(directory, '../private.json'), /Invalid local Debug/);
    await writeFile(join(directory, 'index.json'), '{broken');
    response = await fetch(`${root}local-debug/index.json`);
    assert.equal(response.status, 500);
    assert.match(await response.text(), /No published data was substituted/);
    assert.equal(errors.length, 1);
});
