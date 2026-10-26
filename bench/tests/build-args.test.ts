import assert from 'node:assert/strict';
import test from 'node:test';
import { type BenchContext } from '../src/context.js';
import { App, Preset, Runtime } from '../src/enums.js';
import { getCoreClrNativeArgs } from '../src/stages/build.js';

const ctx = {
    crossgen2Dir: '/tmp/crossgen2',
    r2rPackVersion: '12.0.0-test',
} satisfies Pick<BenchContext, 'crossgen2Dir' | 'r2rPackVersion'>;

test('Avalonia CoreCLR R2R uses the no-workload relink route', () => {
    const expected = [
        '/p:Crossgen2InBuildDir=/tmp/crossgen2',
        '/p:WasmR2RPackVersion=12.0.0-test',
        '/p:WasmBuildNative=true',
        '/p:UsingBrowserRuntimeWorkload=false',
    ];

    for (const app of [App.SemiAvalonia, App.AvaloniaBench]) {
        assert.deepEqual(getCoreClrNativeArgs(ctx, Runtime.CoreCLR, Preset.Aot, app), expected);
    }
});

test('unrelated runtime and preset native arguments remain unchanged', () => {
    assert.deepEqual(
        getCoreClrNativeArgs(ctx, Runtime.CoreCLR, Preset.Aot, App.EmptyBlazor),
        [
            '/p:Crossgen2InBuildDir=/tmp/crossgen2',
            '/p:WasmR2RPackVersion=12.0.0-test',
        ],
    );
    assert.deepEqual(
        getCoreClrNativeArgs(ctx, Runtime.Mono, Preset.Aot, App.SemiAvalonia),
        ['/p:WasmBuildNative=true'],
    );
    assert.deepEqual(
        getCoreClrNativeArgs(ctx, Runtime.CoreCLR, Preset.NativeRelink, App.SemiAvalonia),
        [
            '/p:Crossgen2InBuildDir=/tmp/crossgen2',
            '/p:WasmBuildNative=true',
        ],
    );
});
