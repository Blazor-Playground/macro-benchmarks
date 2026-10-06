import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContext } from '../src/args.js';
import { App, getAppDisableReason } from '../src/enums.js';

test('default app selection excludes temporarily disabled Avalonia apps', async () => {
    const ctx = await buildContext([]);

    assert.equal(ctx.apps.includes(App.SemiAvalonia), false);
    assert.equal(ctx.apps.includes(App.AvaloniaBench), false);
    assert.match(getAppDisableReason(App.SemiAvalonia) ?? '', /dotnet\/runtime\/issues\/135200/);
    assert.match(getAppDisableReason(App.AvaloniaBench) ?? '', /dotnet\/runtime\/issues\/135200/);
});

test('explicit app selection retains disabled apps for skip reporting', async () => {
    const ctx = await buildContext([
        '--app',
        `${App.SemiAvalonia},${App.AvaloniaBench}`,
    ]);

    assert.deepEqual(ctx.apps, [App.SemiAvalonia, App.AvaloniaBench]);
});
