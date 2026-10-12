// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

await Blazor.start({
    configureRuntime: dotnet => dotnet.withModuleConfig({
        onDotnetReady: () => {
            globalThis.getDotnetRuntime(0).setModuleImports('main.mjs', {
                bench: {
                    setManagedReady: () => {
                        globalThis.havitManagedMs = performance.now();
                    },
                    setRendered: () => {
                        requestAnimationFrame(() => requestAnimationFrame(() => {
                            globalThis.havitStartup = {
                                managedMs: globalThis.havitManagedMs,
                                renderedMs: performance.now(),
                            };
                            console.log('Havit startup', globalThis.havitStartup);
                        }));
                    },
                },
            });
        },
    }),
});
