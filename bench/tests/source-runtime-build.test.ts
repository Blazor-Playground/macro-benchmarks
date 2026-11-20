import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildContext } from '../src/args.js';
import {
    recordRuntimeSdk, runtimeBuildContext, sdkInfoForBuild,
    type BenchContext, type RuntimeSourceInfo, type SdkInfo,
} from '../src/context.js';
import { App, Preset, Runtime } from '../src/enums.js';
import { populateVersionFields } from '../src/lib/version-utils.js';
import { run as downloadSdk } from '../src/stages/download-sdk.js';
import { run as buildRuntime, validateRuntimePackSource } from '../src/stages/build-runtime.js';

function sdk(version: string): SdkInfo {
    return populateVersionFields({
        sdkVersion: version, runtimeGitHash: 'a'.repeat(40),
        runtimeCommitDateTime: '2026-11-16T00:00:00Z',
        runtimeCommitAuthor: 'Author', runtimeCommitMessage: 'Source',
        aspnetCoreGitHash: 'b'.repeat(40), sdkGitHash: 'c'.repeat(40), vmrGitHash: 'd'.repeat(40),
        aspnetCoreCommitDateTime: '', aspnetCoreCommitAuthor: '', aspnetCoreCommitMessage: '',
        aspnetCoreVersion: version.startsWith('11.') ? '11.0.0' : '12.0.0-test',
        runtimePackVersion: version.startsWith('11.') ? '11.0.0' : '12.0.0-test',
        workloadVersion: '', bootstrapSdkVersion: version, releaseDate: '2026-11-16',
        isRuntimeCustomBuild: true,
    });
}

async function fixture(t: { after: (fn: () => Promise<void>) => void }): Promise<BenchContext> {
    const root = await mkdtemp(join(tmpdir(), 'split-runtime-build-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const primary = sdk('12.0.100-alpha.1.test');
    const source = (ref: string, commit: string): RuntimeSourceInfo => ({
        repo: 'dotnet/runtime', ref, commit, committedAt: '2026-11-16T00:00:00Z',
        commitAuthor: 'Author', commitMessage: ref,
    });
    primary.runtimeSources = {
        coreclr: recordRuntimeSdk(source('main', '1'.repeat(40)), primary),
        mono: recordRuntimeSdk(source('release/11.0', '2'.repeat(40)), sdk('11.0.100')),
    };
    const base = await buildContext([]);
    return {
        ...base, artifactsDir: root, repoRoot: root, sdkInfo: primary,
        sdkDir: join(root, `sdks/${base.platform}.sdk${primary.sdkVersion}`),
        dotnetBin: join(root, `sdks/${base.platform}.sdk${primary.sdkVersion}`,
            base.platform === 'windows' ? 'dotnet.exe' : 'dotnet'),
        runtimeBuildRequired: true, runtimeCommit: '1'.repeat(40),
        runtimes: [Runtime.Mono, Runtime.CoreCLR], buildLabel: 'comparison-label',
    };
}

async function savedPacks(ctx: BenchContext): Promise<void> {
    for (const runtime of ctx.runtimes) {
        const source = ctx.sdkInfo.runtimeSources![runtime === Runtime.Mono ? 'mono' : 'coreclr']!;
        const directory = join(ctx.artifactsDir, `runtime-pack-${runtime}`);
        await mkdir(directory);
        await writeFile(join(directory, 'benchmark-source.json'), JSON.stringify({
            repo: source.repo, ref: source.ref, commit: source.commit,
            runtimePackVersion: runtime === Runtime.Mono ? '11.0.1-dev' : '12.0.0-dev',
        }));
    }
}

test('Mono uses its own SDK and framework without borrowing CoreCLR ASP.NET packages', async t => {
    const ctx = await fixture(t);
    ctx.aspnetCorePackagesDir = '/coreclr-aspnet-packages';
    ctx.aspnetCorePackageVersion = '12.0.0-custom';
    const mono = runtimeBuildContext(ctx, Runtime.Mono);
    assert.equal(mono.sdkInfo.sdkVersion, '11.0.100');
    assert.equal(mono.sdkInfo.aspnetCoreVersion, '11.0.0');
    assert.equal(mono.dotnetBin, join(ctx.artifactsDir, `sdks/${ctx.platform}.sdk11.0.100`,
        ctx.platform === 'windows' ? 'dotnet.exe' : 'dotnet'));
    assert.equal(mono.aspnetCorePackagesDir, undefined);
    assert.equal(mono.buildLabel, ctx.buildLabel);
    assert.equal(runtimeBuildContext(ctx, Runtime.CoreCLR).aspnetCorePackagesDir, ctx.aspnetCorePackagesDir);
    delete ctx.sdkInfo.runtimeSources!.mono!.sdkInfo;
    assert.throws(() => runtimeBuildContext(ctx, Runtime.Mono), /own resolved SDK/);
});

test('SDK acquisition detects each cached SDK framework independently without executing dotnet', async t => {
    const ctx = await fixture(t);
    for (const runtime of ctx.runtimes) {
        const selected = runtimeBuildContext(ctx, runtime);
        const version = selected.sdkInfo.sdkVersion;
        await mkdir(join(selected.sdkDir, 'sdk', version), { recursive: true });
        await writeFile(selected.dotnetBin, 'not an executable');
        await writeFile(join(selected.sdkDir, 'sdk-info.json'), JSON.stringify(selected.sdkInfo));
        await writeFile(join(selected.sdkDir, 'sdk', version, 'Microsoft.NETCoreSdk.BundledVersions.props'),
            `<Project><BundledNETCoreAppPackageVersion>${selected.sdkInfo.runtimePackVersion}</BundledNETCoreAppPackageVersion>` +
            `<BundledNETCoreAppTargetFrameworkVersion>${selected.sdkInfo.major}.0</BundledNETCoreAppTargetFrameworkVersion></Project>`);
    }
    const result = await downloadSdk(ctx);
    assert.equal(result.sdkInfo.runtimeSources?.mono?.targetFramework, 'net11.0');
    assert.equal(result.sdkInfo.runtimeSources?.coreclr?.targetFramework, 'net12.0');
    assert.equal(runtimeBuildContext(result, Runtime.Mono).sdkInfo.bundledFrameworkTfm, 'net11.0');
});

test('prebuilt runtime packs must match both immutable source selections', async t => {
    const ctx = await fixture(t);
    await savedPacks(ctx);
    const result = await buildRuntime(ctx);
    assert.equal(result.sdkInfo.runtimeSources?.mono?.runtimePackVersion, '11.0.1-dev');
    assert.equal(result.sdkInfo.runtimePackVersion, '12.0.0-dev');
    ctx.sdkInfo.runtimeSources!.mono!.commit = '3'.repeat(40);
    await assert.rejects(buildRuntime(ctx), /Runtime pack does not match/);
    const record = JSON.parse(await readFile(join(ctx.artifactsDir, 'runtime-pack-mono/benchmark-source.json'), 'utf8'));
    assert.equal(record.commit, '2'.repeat(40));
    assert.throws(() => validateRuntimePackSource({}, ctx.sdkInfo.runtimeSources!.mono!), /does not match/);
});

test('a matching runtime pack does not permit a cached compiler from another source', async t => {
    const ctx = await fixture(t);
    await savedPacks(ctx);
    const artifacts = join(ctx.artifactsDir, 'runtime-src-coreclr/artifacts');
    await mkdir(join(artifacts, 'bin/coreclr/browser.wasm.Release/arm64/crossgen2'), { recursive: true });
    await writeFile(join(artifacts, 'benchmark-source.json'), JSON.stringify({
        ...ctx.sdkInfo.runtimeSources!.coreclr, commit: 'f'.repeat(40), runtimePackVersion: '12.0.0-dev',
    }));
    await assert.rejects(buildRuntime(ctx), /Runtime pack does not match/);
});

test('a transferred build manifest supplies the actual runtime SDK rather than the collector SDK', async t => {
    const ctx = await fixture(t);
    const result = sdkInfoForBuild(sdk('12.0.100-collector'), {
        app: App.HavitBootstrap, runtime: Runtime.Mono, preset: Preset.NoWorkload,
        publishDir: '/fixture', integrity: { fileCount: 1, totalBytes: 1 }, compileTimeMs: 1,
        runtimeSources: ctx.sdkInfo.runtimeSources,
    });
    assert.equal(result.sdkVersion, '11.0.100');
    assert.equal(result.runtimeGitHash, '2'.repeat(40));
    assert.equal(result.aspnetCoreVersion, '11.0.0');
});
