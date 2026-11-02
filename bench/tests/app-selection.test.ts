import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContext } from '../src/args.js';
import { type BenchContext } from '../src/context.js';
import { App, Preset, Runtime, shouldSkipBuild, shouldSkipMeasurement } from '../src/enums.js';

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
