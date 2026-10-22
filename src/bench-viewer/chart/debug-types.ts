import type { ComparisonMetric, ComparisonPoint } from './focus-chart.js';
import type { FocusComparison, FocusRange, FocusWindow } from './focus-types.js';

export interface DebugMeasurement {
    status: string;
    reason: string;
    requested: number;
    successful: number;
    valueMs: number | null;
    aggregation: 'median';
    properties: Record<string, string>;
}

export interface DebugBatch {
    id: string;
    app: string;
    preset: 'dev-loop' | 'debug';
    methodology: string;
    measuredAt: string;
    smoke: boolean;
    sdk: { version: string; day: string | null };
    source: { harnessSha: string; harnessDigest: string; appDigest: string };
    environment: {
        os: string; arch: string; cpu: string; cpuCount: number; memoryBytes: number; browser: string;
        browserChannel: string; playwright: string; node: string; headless: boolean;
        runnerClass: string; runnerId: string; controlled: boolean; comparisonScope?: 'local-paired' | 'ci-paired'; policy: string;
    };
    runtimes: Record<'mono' | 'coreclr', {
        properties: Record<string, string>;
        measurements: Record<string, DebugMeasurement>;
    }>;
}

export interface DebugIndex {
    schemaVersion: 1;
    generation: string;
    lastUpdated: string;
    apps: { id: string; file: string }[];
}
export interface DebugPublication { index: DebugIndex; batches: DebugBatch[] }
export interface DebugRuntimeSummary extends DebugMeasurement { properties: Record<string, string> }
export interface DebugMetricReport extends ComparisonMetric {
    key: string;
    boundary: string;
    description: string;
    status: string;
    message: string;
    comparison: FocusComparison | null;
    averageComparison: FocusComparison | null;
    latest: ComparisonPoint | null;
    mono: DebugRuntimeSummary | null;
    coreclr: DebugRuntimeSummary | null;
    buildMono: DebugMeasurement | null;
    buildCoreclr: DebugMeasurement | null;
    buildMonoAverage: FocusWindow | null;
    buildCoreclrAverage: FocusWindow | null;
    sdk: string | null;
    day: string | null;
    measuredAt: string | null;
    olderPair: boolean;
    smoke: boolean;
    controlled: boolean;
    localPaired: boolean;
}
export interface DebugReport {
    app: string;
    apps: string[];
    range: FocusRange;
    startDay: string;
    endDay: string;
    lastUpdated: string;
    rawDataPath: string | null;
    metrics: DebugMetricReport[];
}

export const DEBUG_METRICS = [
    { id: 'first-run', key: 'debug-first-run-to-first-render', title: 'First dotnet run', unit: 's', divisor: 1000,
        boundary: 'Start dotnet run to first render',
        description: 'Includes build and startup with clean compilation outputs. Dependencies are prepared and the browser is already open.' },
    { id: 'incremental-run', key: 'debug-incremental-run-to-first-render', title: 'Incremental dotnet run', unit: 's', divisor: 1000,
        boundary: 'Start dotnet run to first render',
        description: 'The edit is already saved; previous build outputs and browser cache are reused. Includes build and startup, but not stopping the previous run.' },
    { id: 'hot-reload', key: 'debug-hot-reload-edit-to-render', title: 'Hot reload', unit: 'ms', divisor: 1,
        boundary: 'Save edit to updated render',
        description: 'Apply a managed-code change in the running app without restarting or losing state. Watch startup is not timed.' },
    { id: 'rebuild', key: 'debug-rebuild-edit-to-render', title: 'Incremental rebuild', unit: 's', divisor: 1000,
        boundary: 'Save edit to updated render',
        description: 'Scripted stop, incremental build and restart. Includes shutdown time; the restart uses the already-built output.' },
    { id: 'walkthrough', key: 'havit-walkthrough', title: 'End-to-end walkthrough', unit: 's', divisor: 1000,
        boundary: 'Start interactions to scenario completion',
        description: 'Time to complete the existing Havit interaction scenario after startup. Initial page loading is not timed.' },
] as const;
