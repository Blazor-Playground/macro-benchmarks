// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

import { dotnet } from './_framework/dotnet.js'

function setManagedReady() {
    globalThis.dotnet_managed_ready = performance.now();
    globalThis.bench_results = {
        'time-to-create-dotnet': Math.round(globalThis.dotnet_created - globalThis.js_loaded),
        'time-to-reach-managed': Math.round(globalThis.dotnet_managed_ready - globalThis.js_loaded),
        'wasm-memory-size': globalThis.getDotnetRuntime(0).Module.HEAPU8.byteLength,
    };
    globalThis.bench_complete = true;
    const el = globalThis.document?.getElementById('status');
    if (el) {
        el.textContent = JSON.stringify(globalThis.bench_results, null, 2);
    }
}

async function outer() {
    globalThis.onConsole = [];
    globalThis.console.logOriginal = globalThis.console.log;
    globalThis.console.log = (...args) => {
        for (const handler of globalThis.onConsole) {
            handler(...args);
        }
        globalThis.console.logOriginal(...args);
    };

    globalThis.js_loaded = performance.now();

    const { setModuleImports, getAssemblyExports, runMain } = await dotnet
        .withApplicationArgumentsFromQuery()
        .withModuleConfig({
            onRuntimeInitialized: () => { globalThis.bench_runtime_initialized ??= performance.now(); },
        })
        .create();
    globalThis.bench_runtime_ready = { at: performance.now(), source: 'create' };

    setModuleImports('main.mjs', {
        bench: {
            setManagedReady,
            setContentReady: () => { globalThis.bench_content_ready ??= performance.now(); },
            setFirstFrameRendered: () => { globalThis.bench_first_render ??= performance.now(); },
        },
        browser: {
            isFirefox: () => /firefox/i.test(globalThis.navigator?.userAgent ?? ''),
        }
    });

    globalThis.dotnet_created = performance.now();
    globalThis.bench_results = {};

    globalThis.benchStartFirstInteraction = async () => {
        const { Semi } = await getAssemblyExports('Semi.Avalonia.Demo');
        const start = performance.now();
        await Semi.Avalonia.Demo.App.SelectPaletteForBenchmark();
        return performance.now() - start;
    };

    await runMain("Semi.Avalonia.Demo", []);

}

await outer();
