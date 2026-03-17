import { MetricKey } from '../enums.js';

// ── Metric Metadata ──────────────────────────────────────────────────────────

export interface MetricInfo {
    displayName: string;
    unit: string;
    category: 'size' | 'time' | 'throughput' | 'memory';
}

export const METRICS: Record<MetricKey, MetricInfo> = {
    [MetricKey.CompileTime]: { displayName: 'Compile Time', unit: 'ms', category: 'time' },
    [MetricKey.DiskSizeNative]: { displayName: 'Disk Size (WASM)', unit: 'bytes', category: 'size' },
    [MetricKey.DiskSizeAssemblies]: { displayName: 'Disk Size (DLLs)', unit: 'bytes', category: 'size' },
    [MetricKey.DownloadSizeCold]: { displayName: 'Download Size Cold', unit: 'bytes', category: 'size' },
    [MetricKey.DownloadSizeWarm]: { displayName: 'Download Size Warm', unit: 'bytes', category: 'size' },
    [MetricKey.TimeToReachManagedWarm]: { displayName: 'Time to Managed (Warm)', unit: 'ms', category: 'time' },
    [MetricKey.TimeToReachManagedCold]: { displayName: 'Time to Managed (Cold)', unit: 'ms', category: 'time' },
    [MetricKey.TimeToCreateDotnetWarm]: { displayName: 'Time to Create Dotnet (Warm)', unit: 'ms', category: 'time' },
    [MetricKey.TimeToCreateDotnetCold]: { displayName: 'Time to Create Dotnet (Cold)', unit: 'ms', category: 'time' },
    [MetricKey.TimeToExitWarm]: { displayName: 'Time to Exit (Warm)', unit: 'ms', category: 'time' },
    [MetricKey.TimeToExitCold]: { displayName: 'Time to Exit (Cold)', unit: 'ms', category: 'time' },
    [MetricKey.WasmMemorySize]: { displayName: 'WASM Memory Size', unit: 'bytes', category: 'memory' },
    [MetricKey.MemoryPeak]: { displayName: 'Peak JS Heap', unit: 'bytes', category: 'memory' },
    [MetricKey.PizzaWalkthrough]: { displayName: 'Pizza Walkthrough', unit: 'ms', category: 'time' },
    [MetricKey.HavitWalkthrough]: { displayName: 'Havit Walkthrough', unit: 'ms', category: 'time' },
    [MetricKey.MudWalkthrough]: { displayName: 'Mud Walkthrough', unit: 'ms', category: 'time' },
    [MetricKey.UnoWalkthrough]: { displayName: 'Uno Walkthrough', unit: 'ms', category: 'time' },
    [MetricKey.JsInteropOps]: { displayName: 'JS Interop', unit: 'ops/sec', category: 'throughput' },
    [MetricKey.JsonParseOps]: { displayName: 'JSON Parse', unit: 'ops/sec', category: 'throughput' },
    [MetricKey.ExceptionOps]: { displayName: 'Exception Handling', unit: 'ops/sec', category: 'throughput' },
};

export const EXTERNAL_METRICS: MetricKey[] = [
    MetricKey.CompileTime,
    MetricKey.DiskSizeNative,
    MetricKey.DiskSizeAssemblies,
    MetricKey.DownloadSizeCold,
    MetricKey.DownloadSizeWarm,
    MetricKey.TimeToReachManagedWarm,
    MetricKey.TimeToReachManagedCold,
    MetricKey.TimeToCreateDotnetWarm,
    MetricKey.TimeToCreateDotnetCold,
    MetricKey.TimeToExitWarm,
    MetricKey.TimeToExitCold,
    MetricKey.WasmMemorySize,
    MetricKey.MemoryPeak,
    MetricKey.PizzaWalkthrough,
    MetricKey.HavitWalkthrough,
    MetricKey.MudWalkthrough,
    MetricKey.UnoWalkthrough,
];

export const INTERNAL_METRICS: MetricKey[] = [
    MetricKey.CompileTime,
    MetricKey.MemoryPeak,
    MetricKey.TimeToCreateDotnetCold,
    MetricKey.TimeToExitCold,
    MetricKey.WasmMemorySize,
    MetricKey.JsInteropOps,
    MetricKey.JsonParseOps,
    MetricKey.ExceptionOps,
];
