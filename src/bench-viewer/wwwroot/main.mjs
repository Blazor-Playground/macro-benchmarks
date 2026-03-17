// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

import * as chartInterop from './chart/chart-interop.js';

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
    globalThis.js_loaded = performance.now();

    await Blazor.start({
        configureRuntime: dotnet => {
            dotnet.withModuleConfig({
                onRuntimeInitialized: () => {
                    console.log("Blazor runtime initialized");
                },
                onDotnetReady: () => {
                    globalThis.dotnet_created = performance.now();
                    const { setModuleImports } = globalThis.getDotnetRuntime(0);
                    setModuleImports('chart-interop.js', chartInterop);
                    setModuleImports('main.mjs', {
                        bench: {
                            setManagedReady
                        }
                    });
                }
            });
        }
    });
}

await outer();
