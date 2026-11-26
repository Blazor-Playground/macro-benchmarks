// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

import { configureStartupRuntime } from './runtime-ready.mjs';
import { observeInitialContent, registerDomFirstInteraction } from './startup-metrics.mjs';

registerDomFirstInteraction('[data-testid="pizza-special-1"]', '[data-testid="dialog-container"]');

function setManagedReady() {
    globalThis.dotnet_managed_ready = performance.now();
    globalThis.bench_results = {
        'time-to-create-dotnet': Math.round(globalThis.dotnet_created - globalThis.js_loaded),
        'time-to-reach-managed': Math.round(globalThis.dotnet_managed_ready - globalThis.js_loaded),
        'wasm-memory-size': globalThis.getDotnetRuntime(0).Module.HEAPU8.byteLength,
    };
    globalThis.bench_complete = true;
    const isBrowser = typeof globalThis.window !== 'undefined';
    if (isBrowser) {
        const el = globalThis.document?.getElementById('status');
        if (el) {
            el.textContent = JSON.stringify(globalThis.bench_results, null, 2);
        }
    } else {
        console.log(JSON.stringify(globalThis.bench_results));
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
    observeInitialContent('[data-testid="pizza-cards"] [data-testid^="pizza-special-"]');

    await Blazor.start({
        configureRuntime: dotnet => configureStartupRuntime(dotnet, ({ setModuleImports }) => {
            setModuleImports('main.mjs', { bench: { setManagedReady } });
        }),
    });
}

await outer();
