import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContext } from '../src/args.js';
import { type BenchContext } from '../src/context.js';
import { App, getAppDisableReason, Preset, Runtime, shouldSkipBuild } from '../src/enums.js';

test('default .NET 12 app selection excludes incompatible native apps', async () => {
    const ctx = await buildContext([]);

    assert.equal(ctx.apps.includes(App.SemiAvalonia), false);
    assert.equal(ctx.apps.includes(App.AvaloniaBench), false);
    assert.equal(ctx.apps.includes(App.UnoGallery), false);
    assert.match(getAppDisableReason(App.SemiAvalonia) ?? '', /dotnet\/runtime\/issues\/135200/);
    assert.match(getAppDisableReason(App.AvaloniaBench) ?? '', /dotnet\/runtime\/issues\/135200/);
    assert.match(getAppDisableReason(App.UnoGallery, 12) ?? '', /\.NET 12/);
});

test('default app selection retains Uno before .NET 12', async () => {
    const ctx = await buildContext(['--sdk-channel', '11.0']);

    assert.equal(ctx.apps.includes(App.UnoGallery), true);
});

test('explicit app selection retains disabled apps for skip reporting', async () => {
    const ctx = await buildContext([
        '--app',
        `${App.SemiAvalonia},${App.AvaloniaBench},${App.UnoGallery}`,
    ]);

    assert.deepEqual(ctx.apps, [App.SemiAvalonia, App.AvaloniaBench, App.UnoGallery]);
    assert.match(
        shouldSkipBuild(Runtime.Mono, App.UnoGallery, Preset.NativeRelink, {
            sdkInfo: { major: 12 },
        } as BenchContext) ?? '',
        /\.NET 12/,
    );
});
