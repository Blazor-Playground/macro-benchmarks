import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildContext } from '../src/args.js';
import { App, COMPOSITE_PRESETS, CORECLR_R2R_PRESETS, PGO_PRESETS, Preset, Runtime, shouldSkipBuild } from '../src/enums.js';
import { buildSettings } from '../src/lib/build-settings.js';
import { r2rCapabilities, readyToRunMetadata } from '../src/lib/r2r-settings.js';

test('default matrix includes distinct full, partial and composite R2R variants', async () => {
    const ctx = await buildContext([]);
    ctx.sdkInfo = { ...ctx.sdkInfo, major: 12, sdkVersion: '12.0.100-alpha.1.26531.102' };
    for (const preset of CORECLR_R2R_PRESETS) {
        assert.ok(ctx.presets.includes(preset));
        assert.equal(shouldSkipBuild(Runtime.CoreCLR, App.EmptyBlazor, preset, ctx), null);
        assert.equal(shouldSkipBuild(Runtime.CoreCLR, App.EmptyBrowser, preset, ctx), null);
        assert.equal(shouldSkipBuild(Runtime.CoreCLR, App.MicroBenchmarks, preset, ctx), null);
        assert.equal(buildSettings(preset, Runtime.CoreCLR).Configuration, 'Release');
        if (preset !== Preset.Aot) {
            assert.match(shouldSkipBuild(Runtime.Mono, App.EmptyBlazor, preset, ctx) ?? '', /requires CoreCLR/);
            assert.ok(shouldSkipBuild(Runtime.NativeAOTLLVM, App.EmptyBrowser, preset, ctx));
        }
    }
    assert.equal(new Set([...CORECLR_R2R_PRESETS].map(p => buildSettings(p, Runtime.CoreCLR).BenchmarkPreset)).size, 4);
});

test('unsupported selected packs skip only unsupported variants, including from-source packs', async () => {
    const ctx = await buildContext([]);
    ctx.sdkInfo = { ...ctx.sdkInfo, major: 12, sdkVersion: '12.0.100-alpha.1.26531.102' };
    ctx.runtimeBuildRequired = true;
    ctx.r2rCapabilities = { pgo: false, composite: true };
    for (const preset of PGO_PRESETS) {
        assert.match(shouldSkipBuild(Runtime.CoreCLR, App.EmptyBlazor, preset, ctx) ?? '', /134356/);
    }
    assert.equal(shouldSkipBuild(Runtime.CoreCLR, App.EmptyBlazor, Preset.Aot, ctx), null);
    assert.equal(shouldSkipBuild(Runtime.CoreCLR, App.EmptyBlazor, Preset.R2RComposite, ctx), null);
    ctx.r2rCapabilities = { pgo: true, composite: false };
    for (const preset of COMPOSITE_PRESETS) {
        assert.match(shouldSkipBuild(Runtime.CoreCLR, App.EmptyBlazor, preset, ctx) ?? '', /composite R2R/);
    }
    assert.equal(shouldSkipBuild(Runtime.CoreCLR, App.EmptyBlazor, Preset.R2RPgo, ctx), null);
    ctx.runtimeBuildRequired = false;
    ctx.sdkInfo.sdkVersion = '12.0.100-alpha.1.26460.100';
    assert.match(shouldSkipBuild(Runtime.CoreCLR, App.EmptyBlazor, Preset.R2RPgo, ctx) ?? '', /requires SDK/);
});

test('capability detection requires imported upstream targets, not references or preset properties', () => {
    assert.deepEqual(r2rCapabilities('<Target DependsOnTargets="_WasmCoreClrConfigureReadyToRunPgo" /><PublishReadyToRunComposite>true</PublishReadyToRunComposite>'),
        { pgo: false, composite: false });
    assert.deepEqual(r2rCapabilities('<Target Name="_WasmCoreClrConfigureReadyToRunPgo" /><Target Name="_WasmCoreClrValidateCompositeTasks" />'),
        { pgo: true, composite: true });
});

test('R2R metadata records exact profile identity and does not read a profile for full controls', async () => {
    const root = await mkdtemp(join(tmpdir(), 'benchmark-r2r-'));
    try {
        assert.deepEqual(await readyToRunMetadata(Preset.Aot, root, root), { compilation: 'full', composite: false });
        assert.deepEqual(await readyToRunMetadata(Preset.R2RComposite, root, root), { compilation: 'full', composite: true });
        await mkdir(join(root, 'src'));
        const version = '1.0.0-prerelease.26502.1';
        await writeFile(join(root, 'src', 'versions.props'), `<Project><BrowserWasmMibcProfileVersion>${version}</BrowserWasmMibcProfileVersion></Project>`);
        await assert.rejects(readyToRunMetadata(Preset.R2RPgo, root, root), /ENOENT/);
        const directory = join(root, 'optimization.browser-wasm.mibc.runtime', version, 'data');
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, 'DotNet_Blazor_Wasm.mibc'), 'profile-test-bytes');
        for (const preset of PGO_PRESETS) {
            assert.deepEqual(await readyToRunMetadata(preset, root, root), {
                compilation: 'partial-pgo', composite: COMPOSITE_PRESETS.has(preset),
                profile: {
                    package: 'optimization.browser-wasm.MIBC.Runtime', version, file: 'DotNet_Blazor_Wasm.mibc',
                    sha256: createHash('sha256').update('profile-test-bytes').digest('hex'),
                },
            });
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('MSBuild evaluates separate full/partial/composite presets and the standard PGO item', {
    skip: !process.env.BENCH_TEST_DOTNET,
}, async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'benchmark-r2r-msbuild-')));
    try {
        const presets = fileURLToPath(new URL('../../src/presets.props', import.meta.url));
        const targets = fileURLToPath(new URL('../../src/Directory.Build.targets', import.meta.url));
        const project = join(root, 'test.proj');
        await writeFile(project, `<Project>
  <PropertyGroup>
    <RuntimeIdentifier>browser-wasm</RuntimeIdentifier>
    <NuGetPackageRoot>${root}</NuGetPackageRoot>
    <BrowserWasmMibcProfileVersion>1.0.0-prerelease.26502.1</BrowserWasmMibcProfileVersion>
  </PropertyGroup>
  <Import Project="${presets}" />
  <Import Project="${targets}" />
</Project>`);
        for (const preset of CORECLR_R2R_PRESETS) {
            const result = JSON.parse(execFileSync(process.env.BENCH_TEST_DOTNET!, [
                'msbuild', project, ...Object.entries(buildSettings(preset, Runtime.CoreCLR)).map(([key, value]) => `-p:${key}=${value}`),
                '-getProperty:PublishReadyToRun,PublishReadyToRunComposite,Configuration',
                '-getItem:PackageDownload,PublishReadyToRunPgoFiles',
            ], { encoding: 'utf8' }));
            assert.equal(result.Properties.PublishReadyToRun, 'true');
            assert.equal(result.Properties.Configuration, 'Release');
            assert.equal(result.Properties.PublishReadyToRunComposite, COMPOSITE_PRESETS.has(preset) ? 'true' : '');
            assert.equal(result.Items.PackageDownload.length, PGO_PRESETS.has(preset) ? 1 : 0);
            assert.equal(result.Items.PublishReadyToRunPgoFiles.length, PGO_PRESETS.has(preset) ? 1 : 0);
            if (PGO_PRESETS.has(preset)) {
                assert.equal(result.Items.PackageDownload[0].Identity, 'optimization.browser-wasm.MIBC.Runtime');
                assert.equal(result.Items.PackageDownload[0].Version, '[1.0.0-prerelease.26502.1]');
                assert.equal(result.Items.PublishReadyToRunPgoFiles[0].Identity,
                    join(root, 'optimization.browser-wasm.mibc.runtime', '1.0.0-prerelease.26502.1', 'data', 'DotNet_Blazor_Wasm.mibc'));
            }
        }
        const server = JSON.parse(execFileSync(process.env.BENCH_TEST_DOTNET!, [
            'msbuild', project, '-p:BenchmarkPreset=R2RCompositePgo', '-p:RuntimeFlavor=CoreCLR',
            '-p:RuntimeIdentifier=win-x64', '-getProperty:PublishReadyToRun,PublishReadyToRunComposite',
            '-getItem:PackageDownload,PublishReadyToRunPgoFiles',
        ], { encoding: 'utf8' }));
        assert.equal(server.Properties.PublishReadyToRun, 'true');
        assert.equal(server.Properties.PublishReadyToRunComposite, '');
        assert.deepEqual(server.Items.PublishReadyToRunPgoFiles, []);
        assert.deepEqual(server.Items.PackageDownload, []);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
