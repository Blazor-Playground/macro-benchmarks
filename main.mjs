// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

import * as chartInterop from './chart/chart-interop.js';
import * as focusInterop from './chart/focus-interop.js';
import { restorePagesRoute } from './pages-navigation.mjs';
import * as debugInterop from './chart/debug-interop.js';
import { configureStartupRuntime } from './runtime-ready.mjs';
import { observeInitialContent, registerDomFirstInteraction } from './startup-metrics.mjs';

registerDomFirstInteraction('.dashboard-mode-tabs a[href="net12-focus"]', '.net12-focus #focus-flavor:not([disabled])');

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
    restorePagesRoute(document.baseURI, window.location, window.history);
    globalThis.js_loaded = performance.now();
    observeInitialContent('.dashboard-mode-tabs a[aria-current="page"]');

    await Blazor.start({
        configureRuntime: dotnet => configureStartupRuntime(dotnet, ({ setModuleImports }) => {
            setModuleImports('chart-interop.js', chartInterop);
            setModuleImports('focus-interop.js', focusInterop);
            setModuleImports('debug-interop.js', debugInterop);
            setModuleImports('main.mjs', { bench: { setManagedReady } });
        }),
    });
}

await outer();
