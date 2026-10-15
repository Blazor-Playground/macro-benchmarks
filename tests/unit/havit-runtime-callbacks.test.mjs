import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { withRuntimeReady } from '../../src/runtime-ready.mjs';

const source = await readFile(new URL('../../src/havit-bootstrap/wwwroot/main.mjs', import.meta.url), 'utf8');
const executable = source.replace("import { withRuntimeReady } from './runtime-ready.mjs';", '');

async function boot(useBuilderReady, dedicated = true, apiReadyAtInitialize = true, runtimeMissingAtInitialize = false) {
    let clock = 0;
    const registrations = [];
    let initializedAt, readyAt;
    let apiReady = apiReadyAtInitialize;
    const context = {
        console: { log: () => {} },
        withRuntimeReady,
        performance: { now: () => ++clock },
        getDotnetRuntime: () => apiReady ? ({
            Module: { HEAPU8: { byteLength: 4096 } },
            setModuleImports: (name, imports) => registrations.push({ name, imports }),
        }) : runtimeMissingAtInitialize ? undefined : {},
        Blazor: {
            start: async options => {
                const callbacks = {};
                let builderReady;
                options.configureRuntime({
                    withModuleConfig: config => { Object.assign(callbacks, config); },
                    ...(dedicated ? { withDotnetReady: callback => { builderReady = callback; } } : {}),
                });
                if (dedicated) assert.equal(callbacks.onDotnetReady, undefined);
                else builderReady = callbacks.onDotnetReady;
                assert.equal(typeof builderReady, 'function');
                callbacks.onRuntimeInitialized();
                initializedAt = context.dotnet_created;
                if (useBuilderReady) {
                    apiReady = true;
                    builderReady();
                    readyAt = context.dotnet_created;
                }
                registrations.at(-1).imports.bench.setManagedReady();
            },
        },
    };
    await runInNewContext(`(async () => { ${executable} })()`, context);
    return { context, registrations, initializedAt, readyAt };
}

test('Mono can reach managed-ready if a ready callback is not invoked', async () => {
    const { context, registrations } = await boot(false);
    assert.equal(registrations.length, 1);
    assert.equal(registrations[0].name, 'main.mjs');
    assert.equal(context.bench_complete, true);
    assert.ok(context.bench_results['time-to-create-dotnet'] > 0);
    assert.ok(context.bench_results['time-to-reach-managed'] > 0);
});

test('CoreCLR preserves the later dedicated builder-ready timestamp and import registration', async () => {
    const { context, registrations, initializedAt, readyAt } = await boot(true);
    assert.equal(registrations.length, 2);
    assert.ok(readyAt > initializedAt);
    assert.equal(context.dotnet_created, readyAt);
    assert.equal(context.bench_complete, true);
});

test('older SDKs register the ready callback without losing the runtime-initialized fallback', async () => {
    const { context, registrations, initializedAt, readyAt } = await boot(true, false);
    assert.equal(registrations.length, 2);
    assert.ok(readyAt > initializedAt);
    assert.equal(context.bench_complete, true);
});

test('CoreCLR defers imports when its API is not available during native runtime initialization', async () => {
    for (const dedicated of [true, false]) {
        for (const runtimeMissing of [true, false]) {
            const { context, registrations, initializedAt, readyAt } = await boot(true, dedicated, false, runtimeMissing);
            assert.equal(initializedAt, undefined);
            assert.ok(readyAt > 0);
            assert.equal(registrations.length, 1);
            assert.equal(registrations[0].name, 'main.mjs');
            assert.equal(context.dotnet_created, readyAt);
            assert.equal(context.bench_complete, true);
            assert.ok(context.bench_results['time-to-create-dotnet'] > 0);
            assert.ok(context.bench_results['time-to-reach-managed'] > 0);
        }
    }
});
