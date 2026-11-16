// bench-ready.js — injected into Inspect Web's index.html by build.mjs.
//
// Inspect Web runs .NET in a Web Worker, so the harness's usual main-thread readiness markers
// don't exist. This classic script runs before the app's module entry: it opts the page into
// Inspect Web's published-runtime benchmark bridge, then reports time-to-reach-managed once the
// Worker's managed engine answers its first request.
(() => {
    globalThis.js_loaded = performance.now();

    const parameter = 'runtime-benchmark';
    const url = new URL(location.href);
    if (url.searchParams.get(parameter) !== '1') {
        url.searchParams.set(parameter, '1');
        history.replaceState(history.state, '', url);
    }

    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    (async () => {
        while (globalThis.__inspectWebRuntimeBenchmark === undefined) {
            await wait(5);
        }
        const identity = await globalThis.__inspectWebRuntimeBenchmark.host.buildIdentity();
        globalThis.dotnet_managed_ready = performance.now();
        globalThis.inspect_web_identity = identity;
        globalThis.bench_results = {
            'time-to-reach-managed': Math.round(globalThis.dotnet_managed_ready - globalThis.js_loaded),
        };
        globalThis.bench_complete = true;
    })().catch(error => {
        console.error(`inspect-web bench readiness failed: ${error?.stack ?? error}`);
    });
})();
