import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContext } from '../src/args.js';
import { type BenchContext } from '../src/context.js';
import { App, Preset, Runtime, shouldSkipBuild, shouldSkipDeployment, shouldSkipMeasurement } from '../src/enums.js';

test('default .NET 12 app selection includes native apps', async () => {
    const ctx = await buildContext([]);

    assert.equal(ctx.apps.includes(App.SemiAvalonia), true);
    assert.equal(ctx.apps.includes(App.AvaloniaBench), true);
    assert.equal(ctx.apps.includes(App.UnoGallery), true);
});

test('default app selection retains Uno before .NET 12', async () => {
    const ctx = await buildContext(['--sdk-channel', '11.0']);

    assert.equal(ctx.apps.includes(App.UnoGallery), true);
});

test('the dashboard deploys on CoreCLR even before the .NET 12 sample app switch', async () => {
    const ctx = await buildContext([]);
    ctx.sdkInfo = { ...ctx.sdkInfo, major: 11, isPrerelease: false, monoRuntimePackAvailable: true };
    assert.equal(shouldSkipDeployment(Runtime.CoreCLR, App.BenchViewer, Preset.NoWorkload, ctx), null);
    assert.match(shouldSkipDeployment(Runtime.Mono, App.BenchViewer, Preset.NoWorkload, ctx) ?? '', /only with 'coreclr'/);
    assert.match(shouldSkipDeployment(Runtime.CoreCLR, App.BenchViewer, Preset.DevLoop, ctx) ?? '', /no-workload/);
    assert.equal(shouldSkipDeployment(Runtime.Mono, App.RadzenBlazor, Preset.NoWorkload, ctx), null);
    assert.match(shouldSkipDeployment(Runtime.CoreCLR, App.RadzenBlazor, Preset.NoWorkload, ctx) ?? '', /only with 'mono'/);

    ctx.sdkInfo = { ...ctx.sdkInfo, major: 10 };
    assert.match(shouldSkipDeployment(Runtime.CoreCLR, App.BenchViewer, Preset.NoWorkload, ctx) ?? '', /below 11/);
});

test('.NET 12 static sample apps deploy on CoreCLR except Uno', async () => {
    const ctx = await buildContext([]);
    ctx.sdkInfo = { ...ctx.sdkInfo, major: 12, monoRuntimePackAvailable: true };
    assert.equal(shouldSkipDeployment(Runtime.CoreCLR, App.RadzenBlazor, Preset.NoWorkload, ctx), null);
    assert.match(shouldSkipDeployment(Runtime.Mono, App.RadzenBlazor, Preset.NoWorkload, ctx) ?? '', /only with 'coreclr'/);
    assert.equal(shouldSkipDeployment(Runtime.CoreCLR, App.AvaloniaBench, Preset.NativeRelink, ctx), null);
    assert.match(shouldSkipDeployment(Runtime.CoreCLR, App.BlazorPerf, Preset.NoWorkload, ctx) ?? '', /Kestrel/);
    assert.equal(shouldSkipDeployment(Runtime.Mono, App.UnoGallery, Preset.NativeRelink, ctx), null);
    assert.match(shouldSkipDeployment(Runtime.CoreCLR, App.UnoGallery, Preset.NativeRelink, ctx) ?? '', /Mono-only/);

    ctx.sdkInfo.monoRuntimePackAvailable = false;
    assert.equal(shouldSkipDeployment(Runtime.CoreCLR, App.RadzenBlazor, Preset.NoWorkload, ctx), null);
    assert.match(shouldSkipDeployment(Runtime.Mono, App.UnoGallery, Preset.NativeRelink, ctx) ?? '', /not published/);
});

test('Radzen is selected by default and supports modern browser benchmark presets', async () => {
    const ctx = await buildContext([]);
    assert(ctx.apps.includes(App.RadzenBlazor));
    for (const major of [9, 10, 11, 12]) {
        ctx.sdkInfo = { major } as BenchContext['sdkInfo'];
        for (const preset of [Preset.DevLoop, Preset.NoWorkload, Preset.Aot]) {
            assert.equal(shouldSkipBuild(Runtime.Mono, App.RadzenBlazor, preset, ctx), null);
            assert.equal(shouldSkipMeasurement(Runtime.Mono, App.RadzenBlazor, preset, ctx), null);
        }
    }
    ctx.sdkInfo = { major: 12 } as BenchContext['sdkInfo'];
    assert.equal(shouldSkipBuild(Runtime.CoreCLR, App.RadzenBlazor, Preset.NoWorkload, ctx), null);
    ctx.sdkInfo = { major: 8 } as BenchContext['sdkInfo'];
    assert.match(shouldSkipBuild(Runtime.Mono, App.RadzenBlazor, Preset.NoWorkload, ctx) ?? '', /below 9/);
    assert.match(shouldSkipMeasurement(Runtime.Mono, App.RadzenBlazor, Preset.NoWorkload, ctx) ?? '', /below 9/);
});

test('explicit native apps build and measure with .NET 12 native relink', async () => {
    const ctx = await buildContext([
        '--app',
        `${App.SemiAvalonia},${App.AvaloniaBench},${App.UnoGallery}`,
    ]);

    assert.deepEqual(ctx.apps, [App.SemiAvalonia, App.AvaloniaBench, App.UnoGallery]);
    ctx.sdkInfo = { major: 12 } as BenchContext['sdkInfo'];
    for (const app of ctx.apps) {
        assert.equal(shouldSkipBuild(Runtime.Mono, app, Preset.NativeRelink, ctx), null);
        assert.equal(shouldSkipMeasurement(Runtime.Mono, app, Preset.NativeRelink, ctx), null);
    }
    for (const app of [App.SemiAvalonia, App.AvaloniaBench]) {
        assert.equal(shouldSkipBuild(Runtime.CoreCLR, app, Preset.NativeRelink, ctx), null);
        assert.equal(shouldSkipMeasurement(Runtime.CoreCLR, app, Preset.NativeRelink, ctx), null);
    }
});

test('native app runtime and older SDK restrictions remain enforced', async () => {
    const ctx = await buildContext([]);
    ctx.sdkInfo = { major: 12 } as BenchContext['sdkInfo'];
    assert.match(shouldSkipBuild(Runtime.CoreCLR, App.UnoGallery, Preset.NativeRelink, ctx) ?? '', /Mono-only/);
    assert.match(shouldSkipBuild(Runtime.Mono, App.AvaloniaBench, Preset.NoWorkload, ctx) ?? '', /reduced matrix/);
    ctx.sdkInfo = { major: 11 } as BenchContext['sdkInfo'];
    for (const app of [App.SemiAvalonia, App.UnoGallery]) {
        assert.match(shouldSkipBuild(Runtime.Mono, app, Preset.NativeRelink, ctx) ?? '', /LLVM/);
    }
});

test('confirmed missing stock Mono packs are gaps, without blocking CoreCLR or source-built Mono', async () => {
    const ctx = await buildContext([]);
    ctx.sdkInfo = { major: 12, monoRuntimePackAvailable: false, runtimePackVersion: '12.0.0-test' } as BenchContext['sdkInfo'];
    assert.match(shouldSkipBuild(Runtime.Mono, App.HavitBootstrap, Preset.DevLoop, ctx) ?? '', /Mono runtime pack.*not published/);
    assert.match(shouldSkipMeasurement(Runtime.Mono, App.HavitBootstrap, Preset.DevLoop, ctx) ?? '', /not published/);
    assert.equal(shouldSkipBuild(Runtime.CoreCLR, App.HavitBootstrap, Preset.NoWorkload, ctx), null);
    ctx.runtimeBuildRequired = true;
    assert.equal(shouldSkipBuild(Runtime.Mono, App.HavitBootstrap, Preset.DevLoop, ctx), null);
    ctx.runtimeBuildRequired = false;
    delete ctx.sdkInfo.monoRuntimePackAvailable;
    assert.equal(shouldSkipBuild(Runtime.Mono, App.HavitBootstrap, Preset.DevLoop, ctx), null);
});
