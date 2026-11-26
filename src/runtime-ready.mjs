export function withRuntimeReady(builder, callback) {
    if (typeof builder.withDotnetReady === 'function') {
        builder.withDotnetReady(callback);
    } else if (typeof builder.withModuleConfig === 'function') {
        console.warn('Runtime builder lacks withDotnetReady; using the older SDK ready callback.');
        builder.withModuleConfig({ onDotnetReady: callback });
    } else {
        throw new Error('The runtime builder has no supported managed-ready callback API.');
    }
}

export function configureStartupRuntime(builder, registerImports, initializeFallback = false) {
    let registered = false;
    const registerOnce = runtime => {
        if (registered) return;
        registerImports(runtime);
        registered = true;
    };

    builder.withModuleConfig({
        onRuntimeInitialized: () => {
            if (globalThis.bench_runtime_initialized !== undefined) return;
            globalThis.bench_runtime_initialized = performance.now();
            console.log('Blazor runtime initialized');
            if (!initializeFallback || globalThis.bench_runtime_ready) return;
            const runtime = globalThis.getDotnetRuntime(0);
            if (typeof runtime?.setModuleImports === 'function') {
                globalThis.dotnet_created = performance.now();
                globalThis.bench_runtime_ready = { at: globalThis.dotnet_created, source: 'onRuntimeInitialized' };
                registerOnce(runtime);
            }
        },
    });

    const source = typeof builder.withDotnetReady === 'function' ? 'withDotnetReady' : 'onDotnetReady';
    withRuntimeReady(builder, () => {
        if (globalThis.bench_runtime_ready?.source === source) return;
        globalThis.dotnet_created = performance.now();
        globalThis.bench_runtime_ready = { at: globalThis.dotnet_created, source };
        registerOnce(globalThis.getDotnetRuntime(0));
    });
}
