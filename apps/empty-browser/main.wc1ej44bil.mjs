// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

import { dotnet, exit } from './_framework/dotnet.js'

async function outer() {
    const isBrowser = typeof globalThis.window !== 'undefined';
    globalThis.js_loaded = performance.now();

    const { setModuleImports, getAssemblyExports, runMain } = await dotnet
        .withApplicationArguments("start")
        .create();

    setModuleImports('main.mjs', {
        bench: {
            setManagedReady: () => { globalThis.dotnet_managed_ready = performance.now(); }
        }
    });

    globalThis.dotnet_created = performance.now();
    globalThis.bench_results = {};

    await inner({ setModuleImports, getAssemblyExports, runMain }, globalThis.bench_results);

    if (isBrowser) {
        exit(0);
    }

    globalThis.dotnet_exit = performance.now();

    Object.assign(globalThis.bench_results, {
        'time-to-create-dotnet': Math.round(globalThis.dotnet_created - globalThis.js_loaded),
        'time-to-reach-managed': Math.round(globalThis.dotnet_managed_ready - globalThis.js_loaded),
        'wasm-memory-size': globalThis.getDotnetRuntime(0).Module.HEAPU8.byteLength,
        'time-to-exit': Math.round(globalThis.dotnet_exit - globalThis.js_loaded),
    });

    globalThis.bench_complete = true;

    if (isBrowser) {
        const el = globalThis.document?.getElementById('status');
        if (el) {
            el.textContent = JSON.stringify(globalThis.bench_results, null, 2);
        }
    } else {
        console.log(JSON.stringify(globalThis.bench_results));
    }

    if (!isBrowser) {
        exit(0);
    }
}

async function inner({ setModuleImports, getAssemblyExports, runMain }, results) {
    await runMain("EmptyBrowser", []);
}

await outer();
