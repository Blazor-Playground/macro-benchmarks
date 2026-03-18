// ── Dimension Enums ──────────────────────────────────────────────────────────

import { BenchContext } from "./context.js";

export enum Runtime {
    Mono = 'mono',
    CoreCLR = 'coreclr',
    NativeAOTLLVM = 'naotllvm',
}

export enum Preset {
    DevLoop = 'dev-loop',
    NoWorkload = 'no-workload',
    Aot = 'aot',
    NativeRelink = 'native-relink',
    NoJiterp = 'no-jiterp',
    Invariant = 'invariant',
    NoReflectionEmit = 'no-reflection-emit',
}

export enum Engine {
    Chrome = 'chrome',
    Firefox = 'firefox',
    V8 = 'v8',
    Node = 'node',
}

export enum Profile {
    Desktop = 'desktop',
    Mobile = 'mobile',
}

export enum App {
    EmptyBrowser = 'empty-browser',
    EmptyBlazor = 'empty-blazor',
    BlazingPizza = 'blazing-pizza',
    HavitBootstrap = 'havit-bootstrap',
    MicroBenchmarks = 'micro-benchmarks',
    BenchViewer = 'bench-viewer',
    UnoGallery = 'uno-gallery',
    MudBlazor = 'mud-blazor',
    SemiAvalonia = 'semi-avalonia',
}

export enum Stage {
    CheckOutTracking = 'check-out-tracking',
    DockerImage = 'docker-image',
    EnumerateCommits = 'enumerate-commits',
    EnumerateDailyPacks = 'enumerate-daily-packs',
    EnumerateReleasePacks = 'enumerate-release-packs',
    UpdateCache = 'update-cache',
    ResolveSdk = 'resolve-sdk',
    DownloadSdk = 'download-sdk',
    Build = 'build',
    DeployLatestApp = 'deploy-latest-app',
    Measure = 'measure',
    TransformViews = 'transform-views',
    UpdateViews = 'update-views',
    Schedule = 'schedule',
}

export enum MetricKey {
    CompileTime = 'compile-time',
    DiskSizeNative = 'disk-size-native',
    DiskSizeAssemblies = 'disk-size-assemblies',
    DownloadSizeCold = 'download-size-cold',
    DownloadSizeWarm = 'download-size-warm',
    ServerRequestsCold = 'server-requests-cold',
    ServerRequestsWarm = 'server-requests-warm',
    TimeToReachManagedWarm = 'time-to-reach-managed-warm',
    TimeToReachManagedCold = 'time-to-reach-managed-cold',
    TimeToCreateDotnetWarm = 'time-to-create-dotnet-warm',
    TimeToCreateDotnetCold = 'time-to-create-dotnet-cold',
    TimeToExitWarm = 'time-to-exit-warm',
    TimeToExitCold = 'time-to-exit-cold',
    WasmMemorySize = 'wasm-memory-size',
    MemoryPeak = 'memory-peak',
    PizzaWalkthrough = 'pizza-walkthrough',
    HavitWalkthrough = 'havit-walkthrough',
    MudWalkthrough = 'mud-walkthrough',
    UnoWalkthrough = 'uno-walkthrough',
    SemiWalkthrough = 'semi-walkthrough',
    JsInteropOps = 'js-interop-ops',
    JsonParseOps = 'json-parse-ops',
    ExceptionOps = 'exception-ops',
}

// ── App Routing Configuration ────────────────────────────────────────────────

export interface AppConfig {
    /** Only runs in browser engines (chrome, firefox) — no CLI engines */
    browserOnly: boolean;
    /** Uses measure-internal instead of measure-external */
    internal: boolean;
}

export const APP_CONFIG: Record<App, AppConfig> = {
    [App.EmptyBrowser]: { browserOnly: false, internal: false },
    [App.MicroBenchmarks]: { browserOnly: false, internal: true },
    [App.EmptyBlazor]: { browserOnly: true, internal: false },
    [App.BlazingPizza]: { browserOnly: true, internal: false },
    [App.HavitBootstrap]: { browserOnly: true, internal: false },
    [App.BenchViewer]: { browserOnly: true, internal: false },
    [App.MudBlazor]: { browserOnly: true, internal: false },
    [App.UnoGallery]: { browserOnly: true, internal: false },
    [App.SemiAvalonia]: { browserOnly: true, internal: false },
};

// ── Preset Constraints ───────────────────────────────────────────────────────

/** Presets that work without wasm-tools workload */
export const NON_WORKLOAD_PRESETS = new Set<Preset>([
    Preset.DevLoop,
    Preset.NoWorkload,
]);

/** Presets only valid for Mono runtime (error with CoreCLR) */
export const MONO_ONLY_PRESETS = new Set<Preset>([
    Preset.Aot,
    Preset.NoJiterp,
]);

/** Apps that use Blazor (DOM-dependent, no CLI engine support). */
export const BLAZOR_APPS = new Set<App>([App.EmptyBlazor, App.BlazingPizza, App.HavitBootstrap, App.BenchViewer, App.MudBlazor]);
export const NON_BLAZOR_APPS = new Set<App>([App.UnoGallery, App.SemiAvalonia]);
export const BLAZOR_REDUCED_PRESETS = new Set<Preset>([Preset.DevLoop, Preset.NoWorkload, Preset.Aot]);
export const NON_BLAZOR_REDUCED_PRESETS = new Set<Preset>([Preset.NativeRelink, Preset.Aot]);

/**
 * Returns a reason string if the app+preset combination should be skipped,
 * or null if the combination is valid.
 */
export function shouldSkipMeasurement(app: App, preset: Preset, ctx: BenchContext): string | null {
    const build = shouldSkipBuild(app, preset, ctx);
    if (build) {
        return build;
    }

    return null;
}

/**
 * Returns a reason string if the app+preset combination should be skipped,
 * or null if the combination is valid.
 */
export function shouldSkipBuild(app: App, preset: Preset, ctx: BenchContext): string | null {
    if (MONO_ONLY_PRESETS.has(preset) && ctx.runtime === Runtime.CoreCLR) {
        return `Preset '${preset}' is mono-only and cannot be used with runtime '${ctx.runtime}'`;
    }
    if (BLAZOR_APPS.has(app) && preset === Preset.NoReflectionEmit) {
        return `Blazor app '${app}' is not supported with preset '${preset}'`;
    }
    if (BLAZOR_APPS.has(app) && preset === Preset.Invariant) {
        return `Blazor app '${app}' is not supported with preset '${preset}'`;
    }
    if (BLAZOR_APPS.has(app) && !BLAZOR_REDUCED_PRESETS.has(preset)) {
        return `Blazor app '${app}' with '${preset}' is in reduced matrix `;
    }
    if (NON_BLAZOR_APPS.has(app) && !NON_BLAZOR_REDUCED_PRESETS.has(preset)) {
        return `Non-Blazor app '${app}' with '${preset}' is in reduced matrix `;
    }
    if (app === App.MudBlazor && ctx.sdkInfo.major < 9) {
        return `MudBlazor app '${app}' does not build with SDK versions below 9.0.0`;
    }
    if (app === App.SemiAvalonia && ctx.sdkInfo.major < 10) {
        return `SemiAvalonia app '${app}' does not build with SDK versions below 10.0.0`;
    }
    return null;
}

// ── Preset → MSBuild Mapping ─────────────────────────────────────────────────

/** Maps CLI preset to MSBuild BenchmarkPreset property value */
export const PRESET_MAP: Record<Preset, string> = {
    [Preset.DevLoop]: 'DevLoop',
    [Preset.NoWorkload]: 'NoWorkload',
    [Preset.Aot]: 'Aot',
    [Preset.NativeRelink]: 'NativeRelink',
    [Preset.NoJiterp]: 'NoJiterp',
    [Preset.Invariant]: 'Invariant',
    [Preset.NoReflectionEmit]: 'NoReflectionEmit',
};

/** Maps CLI preset to MSBuild Configuration value */
export const PRESET_CONFIG: Record<Preset, string> = {
    [Preset.DevLoop]: 'Debug',
    [Preset.NoWorkload]: 'Release',
    [Preset.Aot]: 'Release',
    [Preset.NativeRelink]: 'Release',
    [Preset.NoJiterp]: 'Release',
    [Preset.Invariant]: 'Release',
    [Preset.NoReflectionEmit]: 'Release',
};

// ── Engine / Profile Constraints ─────────────────────────────────────────────

export const BROWSER_ENGINES = new Set<Engine>([Engine.Chrome, Engine.Firefox]);
export const CLI_ENGINES = new Set<Engine>([Engine.V8, Engine.Node]);

/** Mobile profile requires CDP → Chrome only */
export function profileRequiresCDP(profile: Profile): boolean {
    return profile === Profile.Mobile;
}

// ── Enum Value Lists (for parsing / validation) ─────────────────────────────

export const ALL_RUNTIMES = Object.values(Runtime);
export const ALL_PRESETS = Object.values(Preset);
export const ALL_ENGINES = Object.values(Engine);
export const ALL_PROFILES = Object.values(Profile);
export const ALL_APPS = Object.values(App);
export const ALL_STAGES = Object.values(Stage);
export const ALL_METRIC_KEYS = Object.values(MetricKey);

// ── Enum Parsing Helpers ─────────────────────────────────────────────────────

function parseEnum<T extends string>(value: string, allValues: T[], enumName: string): T {
    if ((allValues as string[]).includes(value)) return value as T;
    throw new Error(`Invalid ${enumName}: '${value}'. Valid values: ${allValues.join(', ')}`);
}

export function parseRuntime(value: string): Runtime {
    return parseEnum(value, ALL_RUNTIMES, 'runtime');
}

export function parsePreset(value: string): Preset {
    return parseEnum(value, ALL_PRESETS, 'preset');
}

export function parseEngine(value: string): Engine {
    return parseEnum(value, ALL_ENGINES, 'engine');
}

export function parseProfile(value: string): Profile {
    return parseEnum(value, ALL_PROFILES, 'profile');
}

export function parseApp(value: string): App {
    return parseEnum(value, ALL_APPS, 'app');
}

export function parseStage(value: string): Stage {
    return parseEnum(value, ALL_STAGES, 'stage');
}

/** Validate that a preset is compatible with a runtime */
export function validatePresetRuntime(preset: Preset, runtime: Runtime): void {
    if (MONO_ONLY_PRESETS.has(preset) && runtime === Runtime.CoreCLR) {
        throw new Error(`Preset '${preset}' is only valid for mono runtime, got '${runtime}'`);
    }
}

/** Get valid engines for an app, optionally filtered */
export function getEnginesForApp(app: App, filter?: Engine[]): Engine[] {
    const config = APP_CONFIG[app];
    const available = config.browserOnly
        ? ALL_ENGINES.filter(e => BROWSER_ENGINES.has(e))
        : [...ALL_ENGINES];
    return filter ? available.filter(e => filter.includes(e)) : available;
}

/** Get valid profiles for an engine, optionally filtered */
export function getProfilesForEngine(engine: Engine, filter?: Profile[]): Profile[] {
    const available = BROWSER_ENGINES.has(engine)
        ? (engine === Engine.Chrome ? [...ALL_PROFILES] : [Profile.Desktop])
        : [Profile.Desktop];
    return filter ? available.filter(p => filter.includes(p)) : available;
}
