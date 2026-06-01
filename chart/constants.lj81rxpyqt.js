// Visual encoding maps and metric configuration constants
export const RUNTIME_COLORS = {
    mono: '#F4B400',
    coreclr: '#4285F4',
    naotllvm: '#34A853',
};
export const PRESET_DASH = {
    'dev-loop': [5, 5],
    'no-workload': [],
    'aot': [10, 5],
    'native-relink': [3, 3],
    'no-jiterp': [10, 3, 3, 3],
    'invariant': [10, 3, 3, 3],
    'no-reflection-emit': [15, 5],
};
export const ENGINE_MARKER = {
    chrome: 'circle',
    firefox: 'triangle',
    v8: 'rect',
    node: 'rectRot',
};
export const PROFILE_LINE_WIDTH = {
    desktop: 1,
    mobile: 2,
};
export const METRIC_UNITS = {
    'compile-time': 's',
    'disk-size-native': 'bytes',
    'disk-size-assemblies': 'bytes',
    'download-size-cold': 'bytes',
    'download-size-warm': 'bytes',
    'server-requests-cold': 'count',
    'server-requests-warm': 'count',
    'time-to-reach-managed-warm': 'ms',
    'time-to-reach-managed-cold': 'ms',
    'time-to-create-dotnet-warm': 'ms',
    'time-to-create-dotnet-cold': 'ms',
    'time-to-exit-warm': 'ms',
    'time-to-exit-cold': 'ms',
    'wasm-memory-size': 'bytes',
    'memory-peak': 'bytes',
    'pizza-walkthrough': 'ms',
    'havit-walkthrough': 'ms',
    'mud-walkthrough': 'ms',
    'uno-walkthrough': 'ms',
    'semi-walkthrough': 'ms',
    'blazor-js-to-cs-number': 'ops/sec',
    'blazor-js-to-cs-string': 'ops/sec',
    'blazor-js-to-cs-json': 'ops/sec',
    'blazor-cs-to-js-number': 'ops/sec',
    'blazor-cs-to-js-string': 'ops/sec',
    'blazor-cs-to-js-json': 'ops/sec',
    'js-interop-ops': 'ops/sec',
    'json-parse-ops': 'ops/sec',
    'exception-ops': 'ops/sec',
    'blazor-counter-heavy-wasm': 'ops/sec',
    'blazor-counter-heavy-server': 'ops/sec',
    'blazor-params-count-wasm': 'ops/sec',
    'blazor-params-count-server': 'ops/sec',
    'blazor-params-count-ssr': 'ops/sec',
    'blazor-params-count-htmlrenderer': 'ops/sec',
    'blazor-params-count-ssr-stress': 'ops/sec',
    'blazor-params-count-htmlrenderer-stress': 'ops/sec',
    'blazor-params-count-server-stress': 'ops/sec',
    'blazor-too-many-components-wasm': 'ops/sec',
    'blazor-too-many-components-server': 'ops/sec',
    'blazor-too-many-components-ssr': 'ops/sec',
    'blazor-too-many-components-htmlrenderer': 'ops/sec',
    'blazor-too-many-components-ssr-stress': 'ops/sec',
    'blazor-too-many-components-htmlrenderer-stress': 'ops/sec',
    'blazor-too-many-components-server-stress': 'ops/sec',
};
export const METRIC_DISPLAY = {
    'compile-time': 'Compile Time (s)',
    'disk-size-native': 'Naive runtime binary size - brotli',
    'disk-size-assemblies': 'Assemblies size - brotli',
    'download-size-cold': 'Download Size (Cold)',
    'download-size-warm': 'Download Size (Warm)',
    'server-requests-cold': 'Server Requests (Cold)',
    'server-requests-warm': 'Server Requests (Warm)',
    'time-to-reach-managed-warm': 'Time to Managed (Warm)',
    'time-to-reach-managed-cold': 'Time to Managed (Cold)',
    'time-to-create-dotnet-warm': 'Time to Create Dotnet (Warm)',
    'time-to-create-dotnet-cold': 'Time to Create Dotnet (Cold)',
    'time-to-exit-warm': 'Time to Exit (Warm)',
    'time-to-exit-cold': 'Time to Exit (Cold)',
    'wasm-memory-size': 'WASM Linear Memory Size',
    'memory-peak': 'Peak JS Heap',
    'pizza-walkthrough': 'Blazing Pizza Walkthrough',
    'havit-walkthrough': 'Havit Bootstrap Walkthrough',
    'mud-walkthrough': 'MudBlazor Walkthrough',
    'igniteui-walkthrough': 'Ignite Walkthrough',
    'uno-walkthrough': 'Uno Gallery Walkthrough',
    'semi-walkthrough': 'Semi Avalonia Walkthrough',
    'blazor-js-to-cs-number': 'Blazor JS\u2192CS Number/sec',
    'blazor-js-to-cs-string': 'Blazor JS\u2192CS String/sec',
    'blazor-js-to-cs-json': 'Blazor JS\u2192CS JSON/sec',
    'blazor-cs-to-js-number': 'Blazor CS\u2192JS Number/sec',
    'blazor-cs-to-js-string': 'Blazor CS\u2192JS String/sec',
    'blazor-cs-to-js-json': 'Blazor CS\u2192JS JSON/sec',
    'js-interop-ops': 'JS Interop',
    'json-parse-ops': 'JSON Parse',
    'exception-ops': 'Exception Handling',
    'blazor-counter-heavy-wasm': 'Counter Heavy (WASM)',
    'blazor-counter-heavy-server': 'Counter Heavy (Server)',
    'blazor-params-count-wasm': 'Params Count (WASM)',
    'blazor-params-count-server': 'Params Count (Server)',
    'blazor-params-count-ssr': 'Params Count (SSR)',
    'blazor-params-count-htmlrenderer': 'Params Count (HtmlRenderer)',
    'blazor-params-count-ssr-stress': 'Params Count (SSR ×100)',
    'blazor-params-count-htmlrenderer-stress': 'Params Count (HtmlRenderer ×10)',
    'blazor-params-count-server-stress': 'Params Count (Server ×25)',
    'blazor-too-many-components-wasm': 'Many Components (WASM)',
    'blazor-too-many-components-server': 'Many Components (Server)',
    'blazor-too-many-components-ssr': 'Many Components (SSR)',
    'blazor-too-many-components-htmlrenderer': 'Many Components (HtmlRenderer)',
    'blazor-too-many-components-ssr-stress': 'Many Components (SSR ×100)',
    'blazor-too-many-components-htmlrenderer-stress': 'Many Components (HtmlRenderer ×10)',
    'blazor-too-many-components-server-stress': 'Many Components (Server ×25)',
};
// OTEL counter short-names → (display, unit). Used for dynamic "{base}-otel-{counter}" metrics.
export const OTEL_COUNTERS = {
    'gc-gen0': { display: 'GC Gen0', unit: 'count' },
    'gc-gen1': { display: 'GC Gen1', unit: 'count' },
    'gc-gen2': { display: 'GC Gen2', unit: 'count' },
    'gc-pause-pct': { display: 'GC Pause %', unit: '%' },
    'alloc-rate': { display: 'Alloc Rate', unit: 'MB/s' },
    'heap-mb': { display: 'Heap Size', unit: 'MB' },
    'lock-contentions': { display: 'Lock Contentions', unit: 'count' },
    'threadpool-threads': { display: 'ThreadPool Threads', unit: 'count' },
    'threadpool-queue': { display: 'ThreadPool Queue', unit: 'count' },
    'cpu-pct': { display: 'CPU Usage', unit: '%' },
    'working-set-mb': { display: 'Working Set', unit: 'MB' },
};
const OTEL_SEP = '-otel-';
/** Human-readable display name for a metric key, including dynamic OTEL counters. */
export function metricDisplay(metric) {
    const known = METRIC_DISPLAY[metric];
    if (known)
        return known;
    const idx = metric.indexOf(OTEL_SEP);
    if (idx > 0) {
        const baseKey = metric.slice(0, idx);
        const counterKey = metric.slice(idx + OTEL_SEP.length);
        const baseDisplay = METRIC_DISPLAY[baseKey] || baseKey;
        const counterDisplay = OTEL_COUNTERS[counterKey]?.display || counterKey;
        return `${baseDisplay} · ${counterDisplay}`;
    }
    return metric;
}
/** Axis unit for a metric key, including dynamic OTEL counters. */
export function metricUnit(metric) {
    const known = METRIC_UNITS[metric];
    if (known)
        return known;
    const idx = metric.indexOf(OTEL_SEP);
    if (idx > 0) {
        const counterKey = metric.slice(idx + OTEL_SEP.length);
        return OTEL_COUNTERS[counterKey]?.unit || '';
    }
    return '';
}
// Build-time metrics are identical across engines/profiles — only show chrome/desktop
export const BUILD_METRICS = new Set([
    'compile-time', 'disk-size-native', 'disk-size-assemblies', 'download-size-cold', 'download-size-warm', 'server-requests-cold', 'server-requests-warm',
]);
// Walkthrough metrics are only collected for chrome/desktop
export const WALKTHROUGH_METRICS = new Set([
    'pizza-walkthrough', 'havit-walkthrough', 'mud-walkthrough', 'uno-walkthrough', 'semi-walkthrough',
]);
// blazor-perf server/wasm benchmarks — only collected for chrome/desktop (no mobile profile).
// Dynamic OTEL counters ("{base}-otel-{counter}") are matched by their base key via
// isBlazorPerfMetric(), so they don't need to be enumerated here.
export const BLAZOR_PERF_METRICS = new Set([
    'blazor-js-to-cs-number', 'blazor-js-to-cs-string', 'blazor-js-to-cs-json',
    'blazor-cs-to-js-number', 'blazor-cs-to-js-string', 'blazor-cs-to-js-json',
    'blazor-counter-heavy-wasm', 'blazor-counter-heavy-server',
    'blazor-params-count-wasm', 'blazor-params-count-server',
    'blazor-params-count-ssr', 'blazor-params-count-htmlrenderer',
    'blazor-params-count-ssr-stress', 'blazor-params-count-htmlrenderer-stress', 'blazor-params-count-server-stress',
    'blazor-too-many-components-wasm', 'blazor-too-many-components-server',
    'blazor-too-many-components-ssr', 'blazor-too-many-components-htmlrenderer',
    'blazor-too-many-components-ssr-stress', 'blazor-too-many-components-htmlrenderer-stress', 'blazor-too-many-components-server-stress',
]);
/** True for blazor-perf benchmark metrics, including their dynamic "{base}-otel-{counter}" keys. */
export function isBlazorPerfMetric(metric) {
    if (BLAZOR_PERF_METRICS.has(metric))
        return true;
    const idx = metric.indexOf(OTEL_SEP);
    return idx > 0 && BLAZOR_PERF_METRICS.has(metric.slice(0, idx));
}
// Metrics to skip for micro-benchmarks (not meaningful for internal throughput tests)
export const MICROBENCH_SKIP_METRICS = new Set([
    'compile-time', 'disk-size-native', 'disk-size-assemblies', 'download-size-cold', 'download-size-warm', 'server-requests-cold', 'server-requests-warm',
]);
// Release tick spacing
export const RELEASE_TICK_MS = 3 * 86400000; // 3 days per release column (used for release-only mode)
// Assert helper — throws instead of silently propagating missing data
export function assert(condition, msg) {
    if (!condition)
        throw new Error(`Assert: ${msg}`);
}
