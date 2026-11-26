import { configureStartupRuntime } from './runtime-ready.mjs';
import { observeInitialContent, registerDomFirstInteraction } from './startup-metrics.mjs';

registerDomFirstInteraction('#page-content a[href="accordion"]', '#page-content[data-benchmark-rendered="/accordion"]');

function setManagedReady() {
    globalThis.dotnet_managed_ready = performance.now();
    globalThis.bench_results = {
        'time-to-create-dotnet': Math.round(globalThis.dotnet_created - globalThis.js_loaded),
        'time-to-reach-managed': Math.round(globalThis.dotnet_managed_ready - globalThis.js_loaded),
        'wasm-memory-size': globalThis.getDotnetRuntime(0).Module.HEAPU8.byteLength,
    };
    globalThis.bench_complete = true;
}

let renderVersion = 0;
function setRendered(path) {
    const version = ++renderVersion;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (version === renderVersion) {
            document.querySelector('#page-content').dataset.benchmarkRendered = `/${path.split(/[?#]/)[0]}`;
        }
    }));
}

globalThis.scrollToBottom = id => {
    const element = document.getElementById(id);
    if (element) element.scrollTop = element.scrollHeight;
};
globalThis.scrollToElement = selector => {
    document.querySelector(selector)?.scrollIntoView();
};

globalThis.js_loaded = performance.now();
observeInitialContent('#page-content a[data-benchmark-route]');
await Blazor.start({
    configureRuntime: dotnet => configureStartupRuntime(dotnet, ({ setModuleImports }) => {
        setModuleImports('main.mjs', {
            bench: { setManagedReady, setRendered },
        });
    }),
});
