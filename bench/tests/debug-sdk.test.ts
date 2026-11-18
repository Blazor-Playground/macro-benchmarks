import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildContext } from '../src/args.js';
import { App, Preset, Runtime, shouldSkipBuild } from '../src/enums.js';
import { monoPackAvailable, selectDebugMonoSdk } from '../src/lib/debug-sdk.js';
import { populateVersionFields } from '../src/lib/version-utils.js';
import { run as resolveSdk } from '../src/stages/resolve-sdk.js';

const primary = populateVersionFields({
    sdkVersion: '12.0.100-alpha.1.26565.106', runtimePackVersion: '12.0.0-alpha.1.26565.106',
    runtimeGitHash: 'a'.repeat(40), aspnetCoreGitHash: 'b'.repeat(40), sdkGitHash: 'c'.repeat(40), vmrGitHash: 'd'.repeat(40),
    runtimeCommitDateTime: '', runtimeCommitAuthor: '', runtimeCommitMessage: '',
    aspnetCoreCommitDateTime: '', aspnetCoreCommitAuthor: '', aspnetCoreCommitMessage: '',
    aspnetCoreVersion: '12.0.0-alpha.1.26565.106', workloadVersion: '', bootstrapSdkVersion: '', releaseDate: '',
});
const monoId = 'microsoft.netcore.app.runtime.mono.browser-wasm';
const releasesUrl = 'https://builds.dotnet.microsoft.com/dotnet/release-metadata/11.0/releases.json';
const monoGaIndex = `https://api.nuget.org/v3-flatcontainer/${monoId}/index.json`;
const feed = (major: number) => `https://pkgs.dev.azure.com/dnceng/public/_packaging/dotnet${major}/nuget/v3/index.json`;

function fixture(available: boolean) {
    const calls: string[] = [];
    const data = new Map<string, { status?: number; body?: unknown }>();
    for (const major of [11, 12]) {
        data.set(feed(major), { body: { resources: [{ '@type': 'PackageBaseAddress/3.0.0', '@id': `https://fixture/${major}/` }] } });
    }
    data.set(`https://fixture/12/${monoId}/index.json`, { body: { versions: available ? [primary.runtimePackVersion] : [] } });
    data.set(`https://fixture/11/${monoId}/index.json`, { body: { versions: [] } });
    data.set(monoGaIndex, { body: { versions: ['11.0.0'] } });
    data.set(releasesUrl, { body: { releases: [
        { 'release-date': '2026-11-10', runtime: { version: '11.0.0' }, sdks: [{ version: '11.0.100' }] },
    ] } });
    const request: typeof fetch = async input => {
        const url = input instanceof Request ? input.url : String(input);
        calls.push(url);
        const response = data.get(url);
        return new Response(JSON.stringify(response?.body ?? {}), { status: response?.status ?? (response ? 200 : 404) });
    };
    const sdk = (runtimeVersion: string, branchStatus = 'behind') => {
        const version = `11.0.${100 + Number(runtimeVersion.split('.')[2])}`;
        const sha = 'f'.repeat(40);
        data.set(`https://builds.dotnet.microsoft.com/dotnet/Sdk/${version}/productCommit-linux-arm64.json`, { body: {
            sdk: { commit: sha }, runtime: { version: runtimeVersion }, aspnetcore: { version: runtimeVersion },
        } });
        data.set(`https://raw.githubusercontent.com/dotnet/dotnet/${sha}/src/source-manifest.json`, { body: {
            repositories: ['runtime', 'aspnetcore', 'sdk'].map(path => ({ path, commitSha: sha })),
        } });
        for (const repo of ['runtime', 'aspnetcore', 'sdk', 'dotnet']) {
            data.set(`https://api.github.com/repos/dotnet/${repo}/commits/${sha}`, { body: {
                commit: { committer: { date: '2026-10-22T00:00:00Z' }, author: { name: 'Fixture' }, message: 'Fixture build' },
            } });
        }
        data.set(`https://api.github.com/repos/dotnet/runtime/compare/release/11.0...${sha}`, { body: { status: branchStatus } });
        data.set(`https://api.github.com/repos/dotnet/dotnet/compare/release/11.0.1xx...${sha}`, { body: { status: branchStatus } });
        return version;
    };
    return { data, calls, request, sdk };
}

test('available Mono keeps the original SDK without resolving a release fallback', async () => {
    const f = fixture(true);
    const result = await selectDebugMonoSdk(primary, 'linux-arm64', f.request);
    assert.equal(result.sdk, primary);
    assert.equal(result.fallback, undefined);
    assert.equal(f.calls.length, 2);
});

test('dev-loop uses the resolve job availability decision without probing it again', async () => {
    const available = fixture(false);
    const original = { ...primary, monoRuntimePackAvailable: true };
    assert.equal((await selectDebugMonoSdk(original, 'linux-arm64', available.request)).sdk, original);
    assert.deepEqual(available.calls, []);

    const missing = fixture(true);
    missing.sdk('11.0.0');
    const result = await selectDebugMonoSdk({ ...primary, monoRuntimePackAvailable: false }, 'linux-arm64', missing.request);
    assert.equal(result.sdk.sdkVersion, '11.0.100');
    assert.ok(!missing.calls.includes(feed(12)));
});

test('missing Mono selects the latest GA, not a newer prerelease or a nightly pack', async () => {
    const f = fixture(false);
    f.data.set(releasesUrl, { body: { releases: [
        { 'release-date': '2026-11-10', runtime: { version: '11.0.0' }, sdks: [{ version: '11.0.100' }] },
        { 'release-date': '2027-01-20', runtime: { version: '11.0.3-preview.1' }, sdks: [{ version: '11.0.103-preview.1' }] },
        { 'release-date': '2027-01-10', runtime: { version: '11.0.2' }, sdks: [{ version: '11.0.102' }] },
    ] } });
    f.data.set(`https://fixture/11/${monoId}/index.json`, { body: { versions: ['11.0.0-servicing.27060.1'] } });
    f.data.set(monoGaIndex, { body: { versions: ['11.0.0', '11.0.2'] } });
    const expected = f.sdk('11.0.2');
    const result = await selectDebugMonoSdk(primary, 'linux-arm64', f.request);
    assert.equal(result.sdk.sdkVersion, expected);
    assert.equal(result.sdk.runtimePackVersion, '11.0.2');
    assert.equal(result.sdk.releaseDate, '2027-01-10');
    assert.equal(result.fallback?.branch, 'release/11.0');
    assert.match(result.fallback!.reason, /12\.0\.0-alpha\.1\.26565\.106.*unavailable/);
    assert.match(result.fallback!.reason, /GA/);
    assert.ok(f.calls.some(url => url.includes('/runtime/compare/release/11.0...')));
    assert.ok(f.calls.some(url => url.includes('/dotnet/compare/release/11.0.1xx...')));
    assert.ok(!f.calls.some(url => url.includes('ci.dot.net/public/Sdk/11.')));
    assert.ok(f.calls.includes(monoGaIndex));
});

test('GA pack availability uses nuget.org rather than a delayed mirror', async () => {
    const f = fixture(false);
    f.data.delete(`https://fixture/11/${monoId}/index.json`);
    assert.equal(await monoPackAvailable('11.0.0', f.request), true);
    assert.deepEqual(f.calls, [monoGaIndex]);
});

test('a missing latest GA pack fails instead of substituting an older GA or nightly', async () => {
    const f = fixture(false);
    f.data.set(releasesUrl, { body: { releases: [
        { 'release-date': '2027-01-10', runtime: { version: '11.0.2' }, sdks: [{ version: '11.0.102' }] },
        { 'release-date': '2026-11-10', runtime: { version: '11.0.0' }, sdks: [{ version: '11.0.100' }] },
    ] } });
    await assert.rejects(() => selectDebugMonoSdk(primary, 'linux-arm64', f.request), /Latest .NET11 GA release is missing/);
    assert.ok(!f.calls.some(url => url.includes('/Sdk/')));
});

test('GA fallback rejects source provenance outside the release line', async () => {
    const f = fixture(false);
    f.sdk('11.0.0', 'diverged');
    await assert.rejects(() => selectDebugMonoSdk(primary, 'linux-arm64', f.request), /could not be verified against.*release\/11\.0/);
});

test('transport and authorization failures never masquerade as absent Mono packs', async () => {
    for (const status of [401, 403, 429, 500, 503]) {
        const f = fixture(false);
        f.data.set(`https://fixture/12/${monoId}/index.json`, { status });
        await assert.rejects(() => selectDebugMonoSdk(primary, 'linux-arm64', f.request), new RegExp(`HTTP ${status}`));
        assert.ok(!f.calls.includes(feed(11)));
    }
    const f = fixture(false);
    f.data.set(`https://fixture/12/${monoId}/index.json`, { status: 404 });
    assert.equal(await monoPackAvailable(primary.runtimePackVersion, f.request), false);
});

test('live SDK resolution carries confirmed Mono availability into the ordinary build matrix', async t => {
    const root = await mkdtemp(join(tmpdir(), 'debug-resolve-mono-'));
    try {
        const f = fixture(false);
        t.mock.method(globalThis, 'fetch', f.request);
        await writeFile(join(root, 'daily-packs-list.json'), JSON.stringify({ packs: [primary] }));
        const base = await buildContext(['--stages', 'resolve-sdk', '--sdk-version', primary.sdkVersion, '--dry-run']);
        const ctx = await resolveSdk({ ...base, repoRoot: root, artifactsDir: root });
        assert.equal(ctx.sdkInfo.monoRuntimePackAvailable, false);
        assert.match(shouldSkipBuild(Runtime.Mono, App.HavitBootstrap, Preset.DevLoop, ctx) ?? '', /not published/);
        assert.equal(shouldSkipBuild(Runtime.CoreCLR, App.HavitBootstrap, Preset.NoWorkload, ctx), null);
        assert.ok(!f.calls.some(url => url.includes('/Sdk/')));
        const path = join(root, 'context.json');
        await writeFile(path, JSON.stringify(ctx));
        const smoke = await buildContext(['--stages', 'build', '--context', path, '--dry-run']);
        assert.deepEqual(smoke.runtimes, [Runtime.Mono, Runtime.CoreCLR]);
        assert.deepEqual(smoke.apps, [App.MicroBenchmarks]);
        assert.deepEqual(smoke.runtimes.filter(runtime => !shouldSkipBuild(runtime, smoke.apps[0], smoke.presets[0], smoke)),
            [Runtime.CoreCLR]);
        const explicit = await buildContext(['--stages', 'build', '--context', path, '--dry-run', '--runtime', 'mono']);
        assert.deepEqual(explicit.runtimes, [Runtime.Mono]);
    } finally { await rm(root, { recursive: true }); }
});
