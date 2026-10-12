import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { fileSizes, startServer, summarize } from './bench.mjs';

test('summary uses numeric order and supports odd/even counts without mutating samples', () => {
    for (const [values, expected] of [
        [[10, 2, 30], { min: 2, median: 10, max: 30 }],
        [[10, 2], { min: 2, median: 6, max: 10 }],
        [[0], { min: 0, median: 0, max: 0 }],
    ]) {
        const original = [...values];
        assert.deepEqual(summarize(values), expected);
        assert.deepEqual(values, original);
    }
    for (const values of [[], [NaN], [Infinity], [-1]]) assert.throws(() => summarize(values));
});

test('server and size metrics use the published payload', async t => {
    const directory = await mkdtemp(join(tmpdir(), 'havit bench-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await mkdir(join(directory, '_framework'));
    const html = '<h1>Getting started</h1>';
    const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
    const br = brotliCompressSync(wasm);
    await writeFile(join(directory, 'index.html'), html);
    await writeFile(join(directory, '_framework', 'app.wasm'), wasm);
    await writeFile(join(directory, '_framework', 'app.wasm.br'), br);
    await writeFile(join(directory, '_framework', 'app.wasm.gz'), gzipSync(wasm));
    const sizes = await fileSizes(directory);
    assert.deepEqual(sizes.total, { rawBytes: html.length + wasm.length, brotliBytes: html.length + br.length });
    assert.deepEqual(sizes.framework, { rawBytes: wasm.length, brotliBytes: br.length });
    await writeFile(join(directory, 'index.html'), `${html}!`);
    assert.equal((await fileSizes(directory)).total.rawBytes, sizes.total.rawBytes + 1);

    const server = await startServer(directory);
    t.after(() => server.close());
    for (const [path, status] of [['', 200], ['components/HxButton', 200], ['missing.js', 404], ['%ZZ', 400], ['%2e%2e%2fsecret', 403], ['%5csecret', 400]]) {
        const response = await fetch(server.url + path);
        assert.equal(response.status, status, path);
        assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin');
        assert.equal(response.headers.get('cross-origin-embedder-policy'), 'require-corp');
        await response.arrayBuffer();
    }
    for (const [accept, expected] of [['br, gzip', 'br'], ['br;q=0, gzip', 'gzip'], ['identity', null]]) {
        const response = await fetch(`${server.url}_framework/app.wasm`, { headers: { 'Accept-Encoding': accept } });
        assert.equal(response.headers.get('content-type'), 'application/wasm');
        assert.equal(response.headers.get('content-encoding'), expected);
        assert.equal(response.headers.get('vary'), 'Accept-Encoding');
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), wasm);
    }
    const head = await fetch(`${server.url}_framework/app.wasm`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal((await fetch(server.url, { method: 'POST' })).status, 405);
    // Avoid URL normalization in fetch when checking encoded traversal.
    const traversal = await new Promise((resolve, reject) => {
        get(`${server.url}%2e%2e%2fsecret`, response => {
            response.resume();
            resolve(response.statusCode);
        }).on('error', reject);
    });
    assert.equal(traversal, 403);
});
