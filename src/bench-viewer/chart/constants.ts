// Visual encoding maps and metric configuration constants

export const ENGINE_COLORS: Record<string, string> = {
    chrome: '#F4B400',
    firefox: '#EA4335',
    v8: '#4285F4',
    node: '#34A853',
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

export const RUNTIME_MARKER: Record<string, string> = {
    mono: 'triangle',
    coreclr: 'circle',
    naotllvm: 'rect',
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
    'uno-walkthrough': 'Uno Gallery Walkthrough',
    'semi-walkthrough': 'Semi Avalonia Walkthrough',
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
]);

// Metrics to skip for micro-benchmarks (not meaningful for internal throughput tests)
export const MICROBENCH_SKIP_METRICS = new Set([
    'compile-time', 'disk-size-native', 'disk-size-assemblies', 'download-size-cold', 'download-size-warm', 'server-requests-cold', 'server-requests-warm',
]);

// Release tick spacing
export const RELEASE_TICK_MS = 3 * 86400000;              // 3 days per release column (used for release-only mode)

// Assert helper — throws instead of silently propagating missing data
export function assert(condition: unknown, msg: string): asserts condition {
    if (!condition) throw new Error(`Assert: ${msg}`);
}
