// Visual encoding maps and metric configuration constants

export const RUNTIME_COLORS: Record<string, string> = {
    mono: '#F4B400',
    coreclr: '#4285F4',
    naotllvm: '#34A853',
};

export const PRESET_DASH: Record<string, number[]> = {
    'dev-loop': [5, 5],
    'no-workload': [],
    'aot': [10, 5],
    'native-relink': [3, 3],
    'no-jiterp': [10, 3, 3, 3],
    'invariant': [10, 3, 3, 3],
    'no-reflection-emit': [15, 5],
};

export const ENGINE_MARKER: Record<string, string> = {
    chrome: 'circle',
    firefox: 'triangle',
    v8: 'rect',
    node: 'rectRot',
};

export const PROFILE_LINE_WIDTH: Record<string, number> = {
    desktop: 1,
    mobile: 2,
};

export const METRIC_UNITS: Record<string, string> = {
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
    'counter-per-second': 'ops/sec',
    'blazor-js-to-cs-number': 'ops/sec',
    'blazor-js-to-cs-string': 'ops/sec',
    'blazor-js-to-cs-json': 'ops/sec',
    'blazor-cs-to-js-number': 'ops/sec',
    'blazor-cs-to-js-string': 'ops/sec',
    'blazor-cs-to-js-json': 'ops/sec',
    'js-interop-ops': 'ops/sec',
    'json-parse-ops': 'ops/sec',
    'exception-ops': 'ops/sec',
};

export const METRIC_DISPLAY: Record<string, string> = {
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
    'counter-per-second': 'Counter clicks/sec',

    'blazor-js-to-cs-number': 'Blazor JS\u2192CS Number/sec',
    'blazor-js-to-cs-string': 'Blazor JS\u2192CS String/sec',
    'blazor-js-to-cs-json': 'Blazor JS\u2192CS JSON/sec',
    'blazor-cs-to-js-number': 'Blazor CS\u2192JS Number/sec',
    'blazor-cs-to-js-string': 'Blazor CS\u2192JS String/sec',
    'blazor-cs-to-js-json': 'Blazor CS\u2192JS JSON/sec',
    'js-interop-ops': 'JS Interop',
    'json-parse-ops': 'JSON Parse',
    'exception-ops': 'Exception Handling',
};

// Build-time metrics are identical across engines/profiles — only show chrome/desktop
export const BUILD_METRICS = new Set([
    'compile-time', 'disk-size-native', 'disk-size-assemblies', 'download-size-cold', 'download-size-warm', 'server-requests-cold', 'server-requests-warm',
]);

// Walkthrough metrics are only collected for chrome/desktop
export const WALKTHROUGH_METRICS = new Set([
    'pizza-walkthrough', 'havit-walkthrough', 'mud-walkthrough', 'uno-walkthrough', 'semi-walkthrough',
    'counter-per-second',
    'blazor-js-to-cs-number', 'blazor-js-to-cs-string', 'blazor-js-to-cs-json',
    'blazor-cs-to-js-number', 'blazor-cs-to-js-string', 'blazor-cs-to-js-json',
]);

// Metrics to skip for micro-benchmarks (not meaningful for internal throughput tests)
export const MICROBENCH_SKIP_METRICS: Set<string> = new Set([
    'compile-time', 'disk-size-native', 'disk-size-assemblies', 'download-size-cold', 'download-size-warm', 'server-requests-cold', 'server-requests-warm',
]);

// Release tick spacing
export const RELEASE_TICK_MS = 3 * 86400000;              // 3 days per release column (used for release-only mode)

// Assert helper — throws instead of silently propagating missing data
export function assert(condition: unknown, msg: string): asserts condition {
    if (!condition) throw new Error(`Assert: ${msg}`);
}
