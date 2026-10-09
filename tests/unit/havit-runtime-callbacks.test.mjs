import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = await readFile(new URL('../../src/havit-bootstrap/wwwroot/main.mjs', import.meta.url), 'utf8');

async function boot(useLegacyReady) {
    let clock = 0;
    const registrations = [];
    let initializedAt, readyAt;
    const context = {
        console: { log: () => {} },
        performance: { now: () => ++clock },
        getDotnetRuntime: () => ({
            Module: { HEAPU8: { byteLength: 4096 } },
            setModuleImports: (name, imports) => registrations.push({ name, imports }),
        }),
        Blazor: {
            start: async options => {
                let callbacks;
                options.configureRuntime({ withModuleConfig: config => { callbacks = config; } });
                callbacks.onRuntimeInitialized();
                initializedAt = context.dotnet_created;
                if (useLegacyReady) {
                    callbacks.onDotnetReady();
                    readyAt = context.dotnet_created;
                }
                registrations.at(-1).imports.bench.setManagedReady();
            },
        },
    };
    await runInNewContext(`(async () => { ${source} })()`, context);
    return { context, registrations, initializedAt, readyAt };
}

test('Mono can reach managed-ready when the legacy dotnetReady callback is not invoked', async () => {
    const { context, registrations } = await boot(false);
    assert.equal(registrations.length, 1);
    assert.equal(registrations[0].name, 'main.mjs');
    assert.equal(context.bench_complete, true);
    assert.ok(context.bench_results['time-to-create-dotnet'] > 0);
    assert.ok(context.bench_results['time-to-reach-managed'] > 0);
});

test('CoreCLR preserves its later legacy dotnetReady timestamp and import registration', async () => {
    const { context, registrations, initializedAt, readyAt } = await boot(true);
    assert.equal(registrations.length, 2);
    assert.ok(readyAt > initializedAt);
    assert.equal(context.dotnet_created, readyAt);
    assert.equal(context.bench_complete, true);
});
