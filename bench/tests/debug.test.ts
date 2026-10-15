import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContext } from '../src/args.js';
import { ALL_PRESETS, Preset, Runtime } from '../src/enums.js';
import { buildExecutionArgs, buildSettings, msbuildArgs } from '../src/lib/build-settings.js';
import { summarizeDebug, hotReloadFailure, type RenderEvidence, type DebugAttempt } from '../src/lib/debug-results.js';
import { debugBuildArgs, debugEntryHtml } from '../src/stages/measure-dev-loop.js';
import { DebugProcess } from '../src/lib/debug-process.js';
import { DEBUG_BROWSER_SIGNAL_OPTIONS, waitForDebugOperation } from '../src/lib/debug-cancellation.js';
import { measureFileSizes } from '../src/lib/measure-utils.js';

test('live metrics reuse the existing dev-loop preset without adding a Debug flavor', async () => {
    const ctx = await buildContext(['--stages', 'measure-dev-loop', '--debug-runs', '1']);
    assert.deepEqual(ctx.presets, [Preset.DevLoop]);
    assert.deepEqual(ctx.apps, ['empty-blazor', 'havit-bootstrap']);
    assert.deepEqual(ctx.engines, ['chrome']);
    assert.deepEqual(ctx.profiles, ['desktop']);
    assert.equal(ctx.debugRuns, 1);
    assert.deepEqual((await buildContext([])).presets, ALL_PRESETS);
    assert.deepEqual(ALL_PRESETS, ['dev-loop', 'no-workload', 'aot', 'native-relink', 'no-jiterp', 'invariant', 'no-reflection-emit']);
    await assert.rejects(() => buildContext(['--preset', 'debug']), /Invalid preset/);
    await assert.rejects(() => buildContext(['--stages', 'measure-dev-loop', '--preset', 'no-workload']), /requires dev-loop/);
    await assert.rejects(() => buildContext(['--stages', 'measure-dev-loop,build']), /only optional/);
    await assert.rejects(() => buildContext(['--stages', 'measure-dev-loop,publish-debug-views']), /only optional/);
    await assert.rejects(() => buildContext(['--stages', 'measure-dev-loop', '--dry-run']), /no --dry-run/);
    await assert.rejects(() => buildContext(['--debug-runs', '1x']), /integer/);
    await assert.rejects(() => buildContext(['--debug-scenarios', 'rebuild,rebuild']), /duplicate/);
    assert.deepEqual(debugBuildArgs('mono'), [
        '-p:BenchmarkPreset=DevLoop', '-p:Configuration=Debug', '-p:RuntimeFlavor=Mono',
    ]);
});

test('DevLoop sets only Configuration=Debug and does not inherit benchmark feature switches', async () => {
    const props = await readFile(new URL('../../src/presets.props', import.meta.url), 'utf8');
    const devLoop = props.match(/<PropertyGroup Condition="'\$\(BenchmarkPreset\)' == 'DevLoop'">([\s\S]*?)<\/PropertyGroup>/)![1];
    assert.deepEqual([...devLoop.matchAll(/<(\w+)>/g)].map(m => m[1]), ['Configuration']);
    assert.doesNotMatch(props, /BenchmarkPreset\)' == 'Debug'/);
    const shared = await readFile(new URL('../../src/Directory.Build.props', import.meta.url), 'utf8');
    assert.match(shared, /Condition="'\$\(BenchmarkPreset\)' != 'DevLoop'">\s*<MSBuildDisableTaskHost>/);
});

test('SDK12 TFM compatibility stays shared rather than excluded from clean Debug', async () => {
    const props = await readFile(new URL('../../src/versions.props', import.meta.url), 'utf8');
    const condition = props.match(/<_UseNet12TargetFrameworkWorkaround Condition="([^"]+)"/)![1];
    assert.equal(condition, "'$(_SdkTfm)' == 'net11.0' and '$(_RuntimeMajor)' == '12'");
    assert.match(props, /<NETCoreAppMaximumVersion Condition="'\$\(_UseNet12TargetFrameworkWorkaround\)' == 'true'">12.0</);
});

test('publish and live measurement share the same DevLoop configuration/runtime mapping', () => {
    assert.deepEqual(buildSettings(Preset.DevLoop, Runtime.Mono), {
        BenchmarkPreset: 'DevLoop', Configuration: 'Debug', RuntimeFlavor: 'Mono',
    });
    assert.deepEqual(buildSettings(Preset.DevLoop, Runtime.CoreCLR), {
        BenchmarkPreset: 'DevLoop', Configuration: 'Debug', RuntimeFlavor: 'CoreCLR',
    });

    assert.deepEqual(msbuildArgs(buildSettings(Preset.Aot, Runtime.CoreCLR)), [
        '-p:BenchmarkPreset=Aot', '-p:Configuration=Release', '-p:RuntimeFlavor=CoreCLR',
    ]);
    assert.deepEqual(buildSettings(Preset.Aot, Runtime.NativeAOTLLVM), {
        BenchmarkPreset: 'Aot', Configuration: 'Release', UsingNativeAOT: 'true',
    });
});

test('the legacy publish driver also leaves DevLoop task-host and parallelism settings at SDK defaults', () => {
    assert.deepEqual(buildExecutionArgs(Preset.DevLoop), []);
    assert.deepEqual(buildExecutionArgs(Preset.DevLoop, true), []);
    assert.deepEqual(buildExecutionArgs(Preset.NoWorkload), ['-p:MSBuildDisableTaskHost=true', '-m:1']);
    assert.deepEqual(buildExecutionArgs(Preset.Aot, true), [
        '-p:MSBuildDisableTaskHost=true', '-p:DisableParallelEmccCompile=true', '-p:DisableParallelAot=true', '-m:1',
    ]);
});

test('DevLoop disk sizes follow emitted compression rather than old no-compression preset assumptions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'devloop-file-sizes-'));
    try {
        const framework = join(root, '_framework');
        await mkdir(framework);
        await writeFile(join(framework, 'dotnet.native.wasm'), Buffer.alloc(100));
        await writeFile(join(framework, 'App.dll'), Buffer.alloc(50));
        assert.deepEqual(await measureFileSizes(root, 'auto'), { diskSizeNative: 100, diskSizeAssemblies: 50 });
        await writeFile(join(framework, 'dotnet.native.wasm.br'), Buffer.alloc(10));
        await writeFile(join(framework, 'App.dll.br'), Buffer.alloc(5));
        assert.deepEqual(await measureFileSizes(root, 'auto'), { diskSizeNative: 10, diskSizeAssemblies: 5 });
        assert.deepEqual(await measureFileSizes(root, false), { diskSizeNative: 100, diskSizeAssemblies: 50 });
        assert.deepEqual(await measureFileSizes(root, true), { diskSizeNative: 10, diskSizeAssemblies: 5 });
    } finally { await rm(root, { recursive: true }); }
});

test('the Debug entrypoint preserves app styles instead of borrowing a reduced publish alternative', () => {
    assert.equal(debugEntryHtml('<link href="EmptyBlazor.styles.css"><script type="importmap"></script><script src="main#[.{fingerprint}].mjs"></script>'),
        '<link href="EmptyBlazor.styles.css"><script src="main.mjs"></script>');
});

test('real in-place update proof rejects reload, restart and missing deltas', () => {
    const before: RenderEvidence = {
        version: 'before-0001', documentId: 'document', runtimeId: 'runtime', generation: 0,
        counter: 1, debuggerAttached: false, metadataUpdates: true, runtime: 'mono',
    };
    const after = { ...before, version: 'after--0001', generation: 1 };
    assert.equal(hotReloadFailure(before, after, 0, 0, [100], [100]), null);
    assert.equal(hotReloadFailure(before, after, 1, 0, [100], [100]), 'unexpected-reload');
    assert.equal(hotReloadFailure(before, after, 0, 1, [100], [100]), 'unexpected-reload');
    assert.equal(hotReloadFailure(before, { ...after, runtimeId: 'new' }, 0, 0, [100], [100]), 'unexpected-restart');
    assert.equal(hotReloadFailure(before, after, 0, 0, [100], [101]), 'unexpected-restart');
    for (const patch of [{ generation: 0 }, { counter: 0 }, { debuggerAttached: true }, { version: 'before-0001' }]) {
        assert.equal(hotReloadFailure(before, { ...after, ...patch }, 0, 0, [100], [100]), 'invalid-sample');
    }
});

test('median counts keep failures and incomplete batches out of success', () => {
    const attempt = (trial: number, valueMs: number | null): DebugAttempt => ({
        trial, status: valueMs === null ? 'timeout' : 'ok', reason: valueMs === null ? 'Timed out' : '',
        startedAt: '2026-09-30T12:00:00Z', valueMs, phases: {}, commands: [], sourceBefore: '', sourceAfter: '',
    });
    const result = summarizeDebug([attempt(1, 10), attempt(2, 30), attempt(3, null)], 3);
    assert.equal(result.status, 'partial');
    assert.equal(result.valueMs, 20);
    assert.equal(result.successful, 2);
    assert.equal(result.attempts.length, 3);
    assert.throws(() => summarizeDebug([attempt(1, 0)], 1), /positive/);
});

test('process timing and cleanup use a real isolated child', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'debug-process-test-'));
    const proc = new DebugProcess(process.execPath, ['-e', 'setTimeout(() => console.log("finished"), 100)'], cwd, process.env);
    try {
        assert.match(await proc.wait(10_000, new AbortController().signal), /finished/);
        assert.ok(proc.ended - proc.started >= 100);
    } finally {
        await proc.close();
        await rm(cwd, { recursive: true });
    }
});

test('owned-host discovery uses a deterministic ps locale', { skip: process.platform === 'win32' }, async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'debug-process-locale-'));
    const keys = ['PATH', 'LC_ALL', 'DEBUG_TEST_PS_PID'] as const;
    const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    let proc: DebugProcess | undefined;
    try {
        await writeFile(join(cwd, 'ps'), `#!/bin/sh
if [ -z "$DEBUG_TEST_PS_PID" ]; then exit 0; fi
if [ "$LC_ALL" = C ]; then
    birth='Wed Oct 14 17:36:37 2026'
else
    birth='Mi. 14 Okt. 17:36:37 2026'
fi
printf '%s %s %s %s\\n' "$DEBUG_TEST_PS_PID" '${process.pid}' "$birth" 'node blazor-devserver.dll'
`, { mode: 0o755 });
        process.env.PATH = `${cwd}:${previous.PATH ?? ''}`;
        process.env.LC_ALL = 'de_DE.UTF-8';
        proc = new DebugProcess(process.execPath, [
            '-e', 'setTimeout(() => console.log("finished"), 1000)', 'blazor-devserver.dll',
        ], cwd, { ...process.env });
        assert.ok(proc.child.pid);
        process.env.DEBUG_TEST_PS_PID = String(proc.child.pid);
        assert.deepEqual(await proc.hostPids(), [proc.child.pid]);
    } finally {
        try {
            if (proc) {
                try { await proc.wait(10_000, new AbortController().signal); }
                finally {
                    delete process.env.DEBUG_TEST_PS_PID;
                    await proc.close();
                }
            }
        } finally {
            for (const key of keys) {
                if (previous[key] === undefined) delete process.env[key];
                else process.env[key] = previous[key];
            }
            await rm(cwd, { recursive: true, force: true });
        }
    }
});

test('browser signal ownership and abortable waits leave cleanup to the harness', async () => {
    assert.deepEqual(DEBUG_BROWSER_SIGNAL_OPTIONS, { handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false });
    const controller = new AbortController();
    let rejectOperation!: (error: Error) => void;
    const pending = waitForDebugOperation(controller.signal, () => new Promise<void>((_, reject) => { rejectOperation = reject; }));
    controller.abort(new Error('test cancellation'));
    await assert.rejects(pending, /test cancellation/);
    // A later page-close rejection is observed, not an unhandled rejection.
    rejectOperation(new Error('page closed during cleanup'));
    await new Promise(resolve => setImmediate(resolve));
    assert.throws(() => waitForDebugOperation(controller.signal, () => Promise.resolve()), /test cancellation/);
    assert.equal(await waitForDebugOperation(new AbortController().signal, () => Promise.resolve(42)), 42);
});
