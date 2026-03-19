// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

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
    const { setModuleImports } = globalThis.getDotnetRuntime(0);

    setModuleImports('main.mjs', {
        bench: {
            setManagedReady,
        }
    });

    globalThis.dotnet_created = performance.now();
    globalThis.bench_results = {};
}

outer();
