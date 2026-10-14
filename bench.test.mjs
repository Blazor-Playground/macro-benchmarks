import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { fileSizes, parseOptions, startServer, summarize } from './bench.mjs';
import { findPackage, localNugetConfig, localProperties, runtimeBuildCommands, verifyLocalPackages } from './local-runtime.mjs';

test('local command runs both configurations and requires a runtime checkout', () => {
    assert.deepEqual(parseOptions(['-p:SomeOption=true']), {
        debug: false, once: false, local: false, runtimeRepo: undefined, publishArgs: ['-p:SomeOption=true'],
    });
    assert.deepEqual(parseOptions(['--local', '--runtime-repo', '/runtime']), {
        debug: false, once: false, local: true, runtimeRepo: '/runtime', publishArgs: [],
    });
    for (const configuration of ['Debug', 'Release']) {
        const commands = runtimeBuildCommands('/runtime', configuration);
        assert.deepEqual(commands.map(({ args }) => args.at(process.platform === 'win32' ? 3 : 0)),
            ['clr+libs+host', 'packs.product']);
        for (const { args } of commands) {
            assert.deepEqual(args.slice(-7),
                ['-os', 'browser', '-arch', 'wasm', '-c', configuration, '/p:RuntimeFlavor=CoreCLR']);
        }
    }
    assert.throws(() => parseOptions(['--runtime-repo']), /requires a dotnet\/runtime checkout/);
    assert.throws(() => parseOptions(['--local']), /requires --runtime-repo/);
    assert.throws(() => parseOptions(['--local', '--debug', '--runtime-repo', '/runtime']), /already runs Debug and Release/);
    assert.throws(() => parseOptions(['--runtime-repo', '/runtime', '-p:RuntimePackDir=/old']), /not supported/);
});

test('local packages and compiler overrides select matching artifacts and reject stale restore', async t => {
    const directory = await mkdtemp(join(tmpdir(), 'havit local-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const shipping = join(directory, 'Shipping');
    const cache = join(directory, 'cache');
    await mkdir(shipping);
    const runtimeId = 'Microsoft.NETCore.App.Runtime.browser-wasm';
    const wasmId = 'Microsoft.NET.Sdk.WebAssembly.Pack';
    const version = '12.0.0-alpha.1.26512.139';
    for (const id of [runtimeId, wasmId]) {
        await writeFile(join(shipping, `${id}.${version}.nupkg`), `${id} locally built`);
        await writeFile(join(shipping, `${id}.${version}.symbols.nupkg`), 'symbols');
    }
    const runtimePack = await findPackage(shipping, runtimeId);
    const wasmSdk = await findPackage(shipping, wasmId);
    for (const pack of [runtimePack, wasmSdk]) {
        const destination = join(cache, pack.id.toLowerCase(), pack.version.toLowerCase());
        await mkdir(destination, { recursive: true });
        await writeFile(join(destination, `${pack.id.toLowerCase()}.${pack.version.toLowerCase()}.nupkg`),
            await readFile(pack.path));
    }
    await verifyLocalPackages({ env: { NUGET_PACKAGES: cache }, packages: [runtimePack, wasmSdk] });
    for (const configuration of ['Release', 'Debug']) {
        const tasks = join(directory, 'Crossgen2Tasks', configuration);
        const compiler = join(directory, `browser.wasm.${configuration}`, 'arm64', 'crossgen2');
        const properties = localProperties({
            runtimePack, wasmSdk, crossgen2Tasks: tasks, crossgen2Dir: compiler,
            targets: join(directory, 'src', 'local-runtime.targets'), configPath: join(directory, 'NuGet.config'),
        });
        assert.ok(properties.includes(`/p:LocalRuntimePackVersion=${version}`));
        assert.ok(properties.includes(`/p:LocalWebAssemblySdkPackVersion=${version}`));
        assert.ok(properties.includes(`/p:Crossgen2InBuildDir=${compiler}`));
        assert.ok(properties.includes(`/p:Crossgen2SdkOverrideTargetsPath=${join(tasks, 'Microsoft.NET.CrossGen.targets')}`));
    }
    assert.match(localNugetConfig(shipping, '<add key="dotnet-public" value="https://example.com/v3/index.json" />'),
        /<packageSource key="local-runtime">[\s\S]*<package pattern="Microsoft.NETCore.App.Runtime.browser-wasm" \/>[\s\S]*<package pattern="Microsoft.NET.Sdk.WebAssembly.Pack" \/>/);
    await writeFile(join(cache, runtimeId.toLowerCase(), version, `${runtimeId.toLowerCase()}.${version}.nupkg`), 'old pack');
    await assert.rejects(verifyLocalPackages({ env: { NUGET_PACKAGES: cache }, packages: [runtimePack, wasmSdk] }),
        /does not match the local build/);
    await writeFile(join(shipping, `${runtimeId}.12.0.0-alpha.1.26513.100.nupkg`), 'newer pack');
    await assert.rejects(findPackage(shipping, runtimeId), /Expected one/);
});

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
