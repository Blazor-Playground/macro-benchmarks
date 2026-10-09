import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { discover, findPackage, localPublicSources, nugetConfig, parseOptions, provenance, xmlEscape } from '../../bench/local-runtime.mjs';

async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), 'local-runtime-test-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const shipping = join(root, 'artifacts', 'packages', 'Release', 'Shipping');
    await mkdir(shipping, { recursive: true });
    await mkdir(join(root, '.dotnet'));
    await writeFile(join(root, '.dotnet', process.platform === 'win32' ? 'dotnet.exe' : 'dotnet'), '');
    for (const id of ['Microsoft.NETCore.App.Runtime.browser-wasm', 'Microsoft.NETCore.App.Runtime.Mono.browser-wasm',
        'Microsoft.NET.Sdk.WebAssembly.Pack']) {
        await writeFile(join(shipping, `${id}.12.0.0-dev.nupkg`), '');
    }
    return { root, shipping };
}

test('local runtime options map existing presets and reject unsupported combinations', () => {
    assert.equal(parseOptions(['--runtime-repo', '/runtime']).variant, 'no-workload');
    assert.equal(parseOptions(['--runtime-repo', '/runtime', '--variant', 'r2r']).variant, 'aot');
    assert.throws(() => parseOptions(['--runtime-repo', '/runtime', '--runtime', 'mono', '--variant', 'r2r']), /R2R requires CoreCLR/);
    assert.equal(parseOptions(['--runtime-repo', '/runtime', '--runtime', 'mono', '--variant', 'aot']).variant, 'aot');
    assert.throws(() => parseOptions([]), /runtime-repo is required/);
    assert.throws(() => parseOptions(['--runtime-repo', '/runtime', '--runtime', 'nativeaot']), /coreclr or mono/);
    assert.throws(() => parseOptions(['--runtime-repo', '/runtime', '--variant', 'composite', '--runtime', 'mono']), /requires CoreCLR/);
    assert.throws(() => parseOptions(['--runtime-repo', '/runtime', '--variant', 'aot', '--runtime', 'mono',
        '--configuration', 'Debug']), /Release runtime build/);
    assert.throws(() => parseOptions(['--runtime-repo', '/runtime', '--label', '../escape']), /label must/);
    assert.throws(() => parseOptions(['--runtime-repo', '/runtime;property=value']), /separator/);
    assert.throws(() => parseOptions(['--runtime-repo', '/runtime', '--tfm', 'net12']), /TFM/);
    assert.throws(() => parseOptions(['--runtime-repo', '/runtime', '--runtime-commit', 'unknown']), /git SHA/);
    assert.throws(() => parseOptions(['--runtime-repo', '/runtime', '--use-sdk-crossgen2']), /only meaningful/);
    assert.throws(() => parseOptions(['--runtime-repo', '/runtime', '--variant', 'aot',
        '--use-sdk-crossgen2', '--crossgen2-dir', '/compiler']), /not both/);
});

test('measurement options are forwarded only when requested', () => {
    const args = ['--runtime-repo', '/runtime', '--measure', '--', '--warm-runs', '2', '--profile', 'desktop'];
    assert.deepEqual(parseOptions(args).measureArgs, args.slice(4));
    assert.throws(() => parseOptions(['--runtime-repo', '/runtime', '--', '--warm-runs', '2']), /require --measure/);
});

test('public feed exclusions are explicit and repeatable, with unsafe separator values rejected', () => {
    const options = parseOptions(['--runtime-repo', '/runtime', '--exclude-source', 'nuget.org',
        '--exclude-source', 'dotnet10']);
    assert.deepEqual(options['exclude-source'], ['nuget.org', 'dotnet10']);
    assert.throws(() => parseOptions(['--runtime-repo', '/runtime', '--exclude-source', 'bad\nname']), /Invalid --exclude-source/);
});

test('discovery uses the actual runtime build layout and bootstrap SDK by default', async t => {
    const { root, shipping } = await fixture(t);
    for (const runtime of ['mono', 'coreclr']) {
        const local = await discover(parseOptions(['--runtime-repo', root, '--runtime', runtime]));
        assert.equal(local.sdkDir, join(root, '.dotnet'));
        assert.equal(local.packagesDir, shipping);
        assert.equal(local.runtimePack.version, '12.0.0-dev');
        assert.equal(local.runtimePack.id.includes('.Mono.'), runtime === 'mono');
        assert.equal(local.crossgen2Dir, undefined);
    }
});

test('source provenance records full HEAD, checkout path and dirty state, including linked worktrees', async t => {
    const { root } = await fixture(t);
    const checkout = join(root, 'source');
    await mkdir(checkout);
    const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' }).trim();
    git('init', '--quiet');
    git('config', 'user.name', 'Fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    await writeFile(join(checkout, 'tracked.txt'), 'clean\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'source fixture');
    const hash = git('rev-parse', 'HEAD');
    assert.deepEqual(await provenance(checkout).then(({ checkout, hash, dirty }) => ({ checkout, hash, dirty })),
        { checkout, hash, dirty: false });
    const worktree = join(root, 'linked worktree');
    git('worktree', 'add', '--quiet', '--detach', worktree, hash);
    await writeFile(join(worktree, 'tracked.txt'), 'uncommitted source\n');
    await writeFile(join(worktree, 'untracked.txt'), 'new source\n');
    const changed = await provenance(worktree);
    assert.equal(changed.checkout, worktree);
    assert.equal(changed.hash, hash);
    assert.equal(changed.dirty, true);
    const standIn = await provenance(join(root, 'artifact-only'), hash);
    assert.equal(standIn.checkout, join(root, 'artifact-only'));
    assert.equal(standIn.dirty, null);
});

test('multiple versions require explicit selection, not lexicographic guessing', async t => {
    const { shipping } = await fixture(t);
    const id = 'Microsoft.NET.Sdk.WebAssembly.Pack';
    await writeFile(join(shipping, `${id}.12.0.0-ci.nupkg`), '');
    await writeFile(join(shipping, `${id}.12.0.0-ci.symbols.nupkg`), '');
    await assert.rejects(findPackage(shipping, id), /found 2/);
    assert.equal((await findPackage(shipping, id, '12.0.0-ci')).version, '12.0.0-ci');
    await assert.rejects(findPackage(shipping, id, '13.0.0'), /found 0/);
});

test('missing packages produce a concrete runtime build instruction', async t => {
    const { root, shipping } = await fixture(t);
    await rm(join(shipping, 'Microsoft.NETCore.App.Runtime.browser-wasm.12.0.0-dev.nupkg'));
    await assert.rejects(discover(parseOptions(['--runtime-repo', root])), /build.sh clr\+libs\+host/);
});

test('R2R requires both local Crossgen2 tasks and the host compiler, unless explicitly opted out', async t => {
    const { root } = await fixture(t);
    const args = ['--runtime-repo', root, '--variant', 'aot'];
    await assert.rejects(discover(parseOptions(args)), /Crossgen2Tasks.dll/);
    const tasks = join(root, 'artifacts', 'bin', 'Crossgen2Tasks', 'Release');
    await mkdir(tasks, { recursive: true });
    for (const file of ['Crossgen2Tasks.dll', 'Microsoft.NET.CrossGen.props', 'Microsoft.NET.CrossGen.targets']) {
        await writeFile(join(tasks, file), '');
    }
    await assert.rejects(discover(parseOptions(args)), /crossgen2.*does not|Missing .*crossgen2/s);
    const fallback = await discover(parseOptions([...args, '--use-sdk-crossgen2']));
    assert.equal(fallback.crossgen2Tasks, tasks);
    assert.equal(fallback.crossgen2Dir, undefined);
    const compiler = join(root, 'artifacts', 'bin', 'coreclr', 'browser.wasm.Release', process.arch, 'crossgen2');
    await mkdir(compiler, { recursive: true });
    await writeFile(join(compiler, process.platform === 'win32' ? 'crossgen2.exe' : 'crossgen2'), '');
    assert.equal((await discover(parseOptions(args))).crossgen2Dir, compiler);
});

test('Mono AOT discovers local native SDK packages, compiler, and provisioned Emscripten', async t => {
    const { root, shipping } = await fixture(t);
    const args = ['--runtime-repo', root, '--runtime', 'mono', '--variant', 'aot'];
    await assert.rejects(discover(parseOptions(args)), /Expected one Microsoft.NET.Runtime\./);
    for (const id of ['Microsoft.NET.Runtime.WebAssembly.Sdk', 'Microsoft.NET.Runtime.MonoAOTCompiler.Task',
        'Microsoft.NET.Runtime.MonoTargets.Sdk']) {
        await writeFile(join(shipping, `${id}.12.0.0-dev.nupkg`), '');
    }
    await writeFile(join(shipping, 'Microsoft.NET.Runtime.MonoAOTCompiler.Task.12.0.0-old.nupkg'), '');
    const compiler = join(root, 'artifacts', 'bin', 'mono', 'browser.wasm.Release', 'cross', 'browser-wasm',
        process.platform === 'win32' ? 'mono-aot-cross.exe' : 'mono-aot-cross');
    await mkdir(join(compiler, '..'), { recursive: true });
    await writeFile(compiler, '');
    await mkdir(join(root, 'src', 'mono', 'browser'), { recursive: true });
    await writeFile(join(root, 'src', 'mono', 'browser', 'emscripten-version.txt'), '4.0.0\n');
    const emsdk = join(root, 'tools');
    await mkdir(join(emsdk, 'emscripten'), { recursive: true });
    await writeFile(join(emsdk, 'emscripten', 'emcc.py'), '');
    const result = await discover(parseOptions([...args, '--emsdk', emsdk]));
    assert.equal(result.monoPackages.length, 3);
    assert.ok(result.monoPackages.every(pack => pack.version === result.wasmSdk.version));
    assert.equal(result.monoCompiler, compiler);
    assert.equal(result.emsdk, emsdk);
});

test('NuGet source mapping pins only local package IDs while retaining public fallback sources', () => {
    const config = nugetConfig([
        { key: 'local-runtime', value: '/runtime & build/Shipping' },
        { key: 'nuget.org', value: 'https://api.nuget.org/v3/index.json' },
    ], ['Microsoft.NETCore.App.Runtime.browser-wasm', 'Microsoft.NET.Sdk.WebAssembly.Pack']);
    assert.match(config, /value="\/runtime &amp; build\/Shipping"/);
    assert.match(config, /<packageSource key="local-runtime">\s+<package pattern="Microsoft.NETCore.App.Runtime.browser-wasm" \/>/);
    assert.match(config, /<packageSource key="nuget.org">\s+<package pattern="\*" \/>/);
    assert.doesNotMatch(config, /Microsoft.NET.ILLink.Tasks|Microsoft.AspNetCore.App|Crossgen2/);
    assert.equal(xmlEscape('<a "b"> &'), '&lt;a &quot;b&quot;&gt; &amp;');
});

test('local default restore uses the official public mirror, preserving repository feeds and explicit exclusions', async () => {
    const config = await readFile(new URL('../../NuGet.config', import.meta.url), 'utf8');
    const lines = [];
    const sources = localPublicSources(config, [], line => lines.push(line));
    assert.equal(sources.filter(source => source.key === 'dotnet-public').length, 1);
    assert.equal(sources[0].value, 'https://pkgs.dev.azure.com/dnceng/public/_packaging/dotnet-public/nuget/v3/index.json');
    assert.ok(!sources.some(source => source.key === 'nuget.org'));
    assert.ok(sources.some(source => source.key === 'dotnet12'));
    assert.ok(lines.some(line => line.includes('official dotnet-public mirror')));
    const excluded = localPublicSources(config, ['dotnet11', 'nuget.org'], () => {});
    assert.ok(!excluded.some(source => source.key === 'dotnet11'));
    assert.ok(excluded.some(source => source.key === 'dotnet-public'));
    assert.throws(() => localPublicSources(config, ['typo'], () => {}), /Unknown --exclude-source/);
    assert.match(config, /key="nuget.org" value="https:\/\/api.nuget.org/);
});

test('late overrides preserve unrelated packs and put Mono metadata conditions inside a target', async () => {
    const targets = await readFile(new URL('../../bench/local-runtime.targets', import.meta.url), 'utf8');
    assert.match(targets, /KnownFrameworkReference Update="Microsoft.NETCore.App"/);
    assert.match(targets, /KnownWebAssemblySdkPack Update="Microsoft.NET.Sdk.WebAssembly.Pack"/);
    assert.doesNotMatch(targets, /KnownILLinkPack|KnownCrossgen2Pack|KnownAspNetCorePack/);
    assert.match(targets, /<Target Name="SelectLocalMonoRuntimePack"[\s\S]+%\(KnownRuntimePack.RuntimePackLabels\)/);
});
