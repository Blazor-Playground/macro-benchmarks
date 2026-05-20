// blazor-perf bench hooks — loaded by the host page
window.blazorPerf = window.blazorPerf || {};

window.blazorPerf.setBenchComponent = function (dotNetRef) {
    window.blazorPerf.benchComponent = dotNetRef;
};

// Signal bench_complete for the measurement framework.
// Use load event to ensure all scripts (including blazor.web.js) have executed.
window.addEventListener('load', function () {
    globalThis.bench_results = { 'time-to-reach-managed': Math.round(performance.now()) };
    globalThis.bench_complete = true;
});
