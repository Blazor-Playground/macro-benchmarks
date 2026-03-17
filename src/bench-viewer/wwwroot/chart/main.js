// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.
import * as chartInterop from './chart-interop.js';
const g = globalThis;
function setManagedReady() {
    g.dotnet_managed_ready = performance.now();
    g.bench_results = {
        'time-to-create-dotnet': Math.round(g.dotnet_created - g.js_loaded),
        'time-to-reach-managed': Math.round(g.dotnet_managed_ready - g.js_loaded),
        'wasm-memory-size': g.getDotnetRuntime(0).Module.HEAPU8.byteLength,
    };
    g.bench_complete = true;
    const isBrowser = typeof window !== 'undefined';
    if (isBrowser) {
        const el = document?.getElementById('status');
        if (el) {
            el.textContent = JSON.stringify(g.bench_results, null, 2);
        }
    }
    else {
        console.log(JSON.stringify(g.bench_results));
    }
}
async function outer() {
    g.js_loaded = performance.now();
    await Blazor.start({
        configureRuntime: (dotnet) => {
            dotnet.withModuleConfig({
                onRuntimeInitialized: () => {
                    console.log("Blazor runtime initialized");
                },
                onDotnetReady: () => {
                    g.dotnet_created = performance.now();
                    const { setModuleImports } = g.getDotnetRuntime(0);
                    setModuleImports('chart-interop.js', chartInterop);
                    setModuleImports('main.js', {
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
