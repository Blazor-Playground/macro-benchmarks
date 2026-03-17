// Type declarations for Chart.js loaded as UMD global (chart.umd.min.js)

interface ChartDatasetBase {
    label?: string;
    data: ChartDataPoint[];
    borderColor?: string;
    backgroundColor?: string;
    borderDash?: number[];
    borderWidth?: number;
    pointStyle?: string;
    pointRadius?: number;
    pointHoverRadius?: number;
    tension?: number;
    fill?: boolean;
    hidden?: boolean;
    _rowKey?: string;
    _zone?: string;
    _metric?: string;
    [key: string]: unknown;
}

interface ChartDataPoint {
    x: number | Date;
    y: number | null;
    _colIndex?: number;
    _bucket?: string;
    _bucketType?: string;
    _sdkVersion?: string;
    _releaseLabel?: string;
    [key: string]: unknown;
}

interface ChartScale {
    getPixelForValue(value: unknown): number;
}

interface ChartArea {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

interface ChartInstance {
    data: { datasets: ChartDatasetBase[] };
    scales: Record<string, ChartScale>;
    options: Record<string, unknown>;
    chartArea: ChartArea;
    ctx: CanvasRenderingContext2D;
    _metric?: string;
    setDatasetVisibility(index: number, visible: boolean): void;
    update(mode?: string): void;
    destroy(): void;
    zoom(amount: number): void;
}

interface ChartPlugin {
    id: string;
    beforeDraw?(chart: ChartInstance): void;
}

interface ChartStatic {
    new(ctx: CanvasRenderingContext2D, config: Record<string, unknown>): ChartInstance;
    register(plugin: ChartPlugin): void;
    getChart(canvas: HTMLCanvasElement): ChartInstance | undefined;
}

declare const Chart: ChartStatic;

// Blazor global
declare const Blazor: {
    start(options: Record<string, unknown>): Promise<void>;
};

// Dotnet runtime globals set on globalThis
interface Window {
    dotnet_managed_ready: number;
    dotnet_created: number;
    js_loaded: number;
    bench_results: Record<string, number>;
    bench_complete: boolean;
    getDotnetRuntime(index: number): {
        Module: { HEAPU8: { byteLength: number } };
        setModuleImports(name: string, imports: Record<string, unknown>): void;
    };
}

declare var dotnet_managed_ready: number;
declare var dotnet_created: number;
declare var js_loaded: number;
declare var bench_results: Record<string, number>;
declare var bench_complete: boolean;
declare function getDotnetRuntime(index: number): {
    Module: { HEAPU8: { byteLength: number } };
    setModuleImports(name: string, imports: Record<string, unknown>): void;
};
